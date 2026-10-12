import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CHANNEL_LABELS, STATUS_LABELS, WORK_TYPE_LABELS, type Idea, type MediaData, type TeamMember } from "@/data/media";
import { audit } from "../api-access";
import { apiCaller, internalRequests } from "../auth";
import { database } from "../db";
import { MediaServerError } from "../http";

export type McpContext = { member: TeamMember; token: string; origin: string };
type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };

export function internal(ctx: McpContext, path: string, init: RequestInit = {}) {
  const request = new Request(`${ctx.origin}${path}`, { ...init, headers: { authorization: `Bearer ${ctx.token}`, ...(init.headers as Record<string, string> | undefined) } });
  internalRequests.add(request);
  return request;
}

export const jsonRequest = (ctx: McpContext, path: string, body: unknown, method = "POST") => internal(ctx, path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const text = (data: unknown): ToolResult => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });

export function tool<Args>(ctx: McpContext, name: string, handler: (args: Args) => Promise<ToolResult | unknown>) {
  return async (args: Args): Promise<ToolResult> => {
    const caller = apiCaller(ctx.member);
    const target = args && typeof args === "object" ? String((args as Record<string, unknown>).ideaId || (args as Record<string, unknown>).attachmentId || "") : "";
    try {
      const result = await handler(args);
      await audit(database(), { keyId: caller?.keyId, memberId: ctx.member.id, channel: "mcp", action: name, target, status: 200 });
      return result && typeof result === "object" && Array.isArray((result as ToolResult).content) && (result as ToolResult).content.every((item) => item && typeof item === "object" && "type" in item) ? result as ToolResult : text(result);
    } catch (error) {
      const status = error instanceof MediaServerError ? error.status : 500;
      await audit(database(), { keyId: caller?.keyId, memberId: ctx.member.id, channel: "mcp", action: name, target, status });
      const message = error instanceof MediaServerError ? `${error.message} (${error.code})` : "تعذّر تنفيذ الطلب على الخادم.";
      return { content: [{ type: "text", text: message }], isError: true };
    }
  };
}

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const CLOSED = ["delivered", "cancelled", "rejected"];
export const isOverdue = (idea: Idea, day = today()) => !CLOSED.includes(idea.status) && idea.status !== "draft" && Boolean(idea.dueDate) && idea.dueDate < day;

export function names(data: Pick<MediaData, "members" | "companies" | "categories">) {
  const member = (id?: string) => data.members.find((item) => item.id === id)?.name || (id ? id : "");
  const company = (id: string) => data.companies.find((item) => item.id === id)?.name || id;
  const category = (id: string) => data.categories.find((item) => item.id === id)?.name || id;
  return { member, company, category };
}

export function summary(idea: Idea, data: MediaData) {
  const label = names(data);
  return {
    id: idea.id, code: idea.code, title: idea.title, status: idea.status, statusLabel: STATUS_LABELS[idea.status],
    company: label.company(idea.companyId), category: label.category(idea.categoryId), workType: WORK_TYPE_LABELS[idea.workType],
    owner: label.member(idea.ownerId), designer: label.member(idea.designerId) || null, priority: idea.priority,
    dueDate: idea.dueDate || null, overdue: isOverdue(idea), attachments: idea.attachments.length, quotations: idea.quotations.length,
    archive: idea.archive?.status || null, updatedAt: idea.updatedAt,
  };
}

export function detail(idea: Idea, data: MediaData, origin: string) {
  const label = names(data);
  return {
    ...summary(idea, data), department: idea.department, description: idea.description, content: idea.content, executionPlan: idea.executionPlan,
    channels: idea.channels.map((channel) => ({ id: channel, label: CHANNEL_LABELS[channel] })), requestedAt: idea.requestedAt, scheduledAt: idea.scheduledAt || null,
    approvedAt: idea.approvedAt || null, deliveredAt: idea.deliveredAt || null, needsQuotes: idea.needsQuotes, managerFeedback: idea.managerFeedback || null,
    quotationsDetail: idea.quotations, sourceProposal: idea.sourceProposal || null, archiveFolder: idea.archive?.folderUrl || null,
    files: idea.attachments.map((file) => ({ id: file.id, name: file.name, kind: file.kind, channel: file.channel || null, size: file.size, mime: file.mime, url: file.url.startsWith("/") ? `${origin}${file.url}` : file.url })),
    history: idea.history.map((event) => ({ at: event.at, by: label.member(event.actorId), action: event.action, note: event.note, from: event.from || null, to: event.to || null })),
  };
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const privateAddress = (address: string) => isIP(address) === 6 ? /^(::1|fc|fd|fe80|::ffff:(10|127|169\.254|192\.168))/i.test(address) : PRIVATE_V4.some((pattern) => pattern.test(address));

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password) throw new MediaServerError("يُقبل رابط https عام فقط.");
  const addresses = isIP(url.hostname) ? [url.hostname] : (await lookup(url.hostname, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (!addresses.length || addresses.some(privateAddress) || url.hostname === "localhost") throw new MediaServerError("لا يمكن جلب ملف من عنوان داخلي.");
}

export async function fetchPublicFile(source: string, limit: number) {
  let url: URL;
  try { url = new URL(source); } catch { throw new MediaServerError("رابط الملف غير صالح."); }
  let response: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) break;
    url = new URL(location, url);
    response = null;
  }
  if (!response?.ok || !response.body) throw new MediaServerError(`تعذّر تنزيل الملف من الرابط (${response?.status ?? "تحويلات كثيرة"}).`);
  if (Number(response.headers.get("content-length") || 0) > limit) throw new MediaServerError("الملف أكبر من الحد المسموح للجلب عبر الرابط.", 413, "FILE_TOO_LARGE");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new MediaServerError("الملف أكبر من الحد المسموح للجلب عبر الرابط.", 413, "FILE_TOO_LARGE"); }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return { bytes, mime: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream", name: decodeURIComponent(url.pathname.split("/").pop() || "file") };
}

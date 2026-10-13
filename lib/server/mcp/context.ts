import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { CHANNEL_LABELS, STATUS_LABELS, WORK_TYPE_LABELS, ideaCompanyIds, type Idea, type MediaData, type TeamMember } from "@/data/media";
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
    company: idea.allCompanies ? "كل الشركات" : ideaCompanyIds(idea).map(label.company).join("، "), companyIds: ideaCompanyIds(idea), allCompanies: idea.allCompanies === true, category: label.category(idea.categoryId), workType: WORK_TYPE_LABELS[idea.workType],
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
    editRequests: (idea.editRequests || []).map((request) => ({ id: request.id, by: label.member(request.requesterId), note: request.note, status: request.status, createdAt: request.createdAt, decidedBy: label.member(request.decidedBy) || null, decisionNote: request.decisionNote || null })),
    history: idea.history.map((event) => ({ at: event.at, by: label.member(event.actorId), action: event.action, note: event.note, from: event.from || null, to: event.to || null })),
  };
}

const blocked = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) blocked.addSubnet(network, prefix, "ipv6");
const isBlocked = (address: string) => blocked.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");

function pinnedLookup(hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) {
  dnsLookup(hostname, { all: true }).then((entries) => {
    const safe = entries.find((entry) => !isBlocked(entry.address));
    if (!entries.length || entries.some((entry) => isBlocked(entry.address)) || !safe) callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 4);
    else callback(null, safe.address, safe.family);
  }, (error) => callback(error, "", 4));
}

function request(url: URL): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== "https:" || url.username || url.password || url.hostname === "localhost" || (isIP(url.hostname.replace(/^\[|\]$/g, "")) && isBlocked(url.hostname.replace(/^\[|\]$/g, "")))) { reject(new MediaServerError("يُقبل رابط https عام فقط، ولا يُجلب ملف من عنوان داخلي.")); return; }
    const outgoing = httpsRequest(url, { method: "GET", lookup: pinnedLookup as never, timeout: 15_000, headers: { "user-agent": "Wasl/1.0" } }, resolve);
    outgoing.on("timeout", () => outgoing.destroy(new MediaServerError("انتهت مهلة تنزيل الملف من الرابط.", 504, "FETCH_TIMEOUT")));
    outgoing.on("error", (error) => reject((error as NodeJS.ErrnoException).code === "EBLOCKED" ? new MediaServerError("لا يمكن جلب ملف من عنوان داخلي.") : error instanceof MediaServerError ? error : new MediaServerError("تعذّر تنزيل الملف من الرابط.")));
    outgoing.end();
  });
}

export async function fetchPublicFile(source: string, limit: number) {
  let url: URL;
  try { url = new URL(source); } catch { throw new MediaServerError("رابط الملف غير صالح."); }
  let response: IncomingMessage | null = null;
  for (let hop = 0; hop < 4; hop++) {
    response = await request(url);
    const location = response.statusCode && response.statusCode >= 300 && response.statusCode < 400 ? response.headers.location : undefined;
    if (!location) break;
    response.resume();
    url = new URL(location, url);
    response = null;
  }
  if (!response || !response.statusCode || response.statusCode >= 400) { response?.resume(); throw new MediaServerError(`تعذّر تنزيل الملف من الرابط (${response?.statusCode ?? "تحويلات كثيرة"}).`); }
  if (Number(response.headers["content-length"] || 0) > limit) { response.destroy(); throw new MediaServerError("الملف أكبر من الحد المسموح للجلب عبر الرابط.", 413, "FILE_TOO_LARGE"); }
  const parts: Buffer[] = [];
  let total = 0;
  for await (const chunk of response) {
    total += (chunk as Buffer).length;
    if (total > limit) { response.destroy(); throw new MediaServerError("الملف أكبر من الحد المسموح للجلب عبر الرابط.", 413, "FILE_TOO_LARGE"); }
    parts.push(chunk as Buffer);
  }
  return { bytes: new Uint8Array(Buffer.concat(parts)), mime: String(response.headers["content-type"] || "application/octet-stream").split(";")[0], name: decodeURIComponent(url.pathname.split("/").pop() || "file") };
}

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AiStatus } from "@/data/engagement";
import { database, type Queryable } from "./db";

export const AI_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "الأسرع والأرخص، يكفي لتصنيف المهام", input: 0.1, output: 0.5, cacheRead: 0.01 },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "توازن جيد بين الجودة والتكلفة", input: 2, output: 10, cacheRead: 0.2 },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "الأعلى جودة والأغلى", input: 4, output: 20, cacheRead: 0.2 },
] as const;
export type AiModelId = (typeof AI_MODELS)[number]["id"];
export type AiEffort = "low" | "medium" | "high";
const PRICE: Record<string, { input: number; output: number; cacheRead: number }> = Object.fromEntries(AI_MODELS.map((model) => [model.id, { input: model.input, output: model.output, cacheRead: model.cacheRead }]));
const DEFAULT_MODEL: AiModelId = "claude-sonnet-5-5";
const RIYADH_MONTH = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date());
let client: Anthropic | null = null;

export class AiUnavailable extends Error {
  constructor(message: string, public code: "NO_KEY" | "DISABLED" | "BUDGET" | "REFUSED" | "FAILED") { super(message); this.name = "AiUnavailable"; }
}

function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return client;
}

export function costOf(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const price = PRICE[model] || PRICE[DEFAULT_MODEL];
  const cached = usage.cache_read_input_tokens || 0, created = usage.cache_creation_input_tokens || 0;
  const plain = Math.max(0, usage.input_tokens - 0);
  return (plain * price.input + created * price.input * 1.25 + cached * price.cacheRead + usage.output_tokens * price.output) / 1_000_000;
}

export async function aiStatus(q: Queryable = database()): Promise<AiStatus> {
  const settings = (await q.query<{ ai_enabled: boolean; ai_budget_usd: string; ai_model: string; ai_effort: string; ai_instructions: string }>("select ai_enabled, ai_budget_usd, ai_model, ai_effort, ai_instructions from wasl.settings where id")).rows[0];
  const month = (await q.query<{ spent: string; calls: string }>("select coalesce(sum(cost_usd), 0)::text as spent, count(*)::text as calls from wasl.ai_usage where to_char(at at time zone 'Asia/Riyadh', 'YYYY-MM') = $1", [RIYADH_MONTH()])).rows[0];
  const configured = Boolean(process.env.ANTHROPIC_API_KEY), enabled = settings?.ai_enabled !== false, budgetUsd = Number(settings?.ai_budget_usd ?? 80), spentUsd = Number(month?.spent || 0);
  const reason = !configured ? "لم يُضبط مفتاح Claude API بعد." : !enabled ? "أوقف مدير النظام الميزات الذكية." : spentUsd >= budgetUsd ? "استُهلكت ميزانية هذا الشهر." : undefined;
  const model = (AI_MODELS.some((item) => item.id === settings?.ai_model) ? settings!.ai_model : DEFAULT_MODEL) as AiModelId;
  const effort = (["low", "medium", "high"].includes(settings?.ai_effort || "") ? settings!.ai_effort : "low") as AiEffort;
  return { configured, enabled, budgetUsd, spentUsd: Math.round(spentUsd * 1000) / 1000, calls: Number(month?.calls || 0), model, effort, instructions: settings?.ai_instructions || "", available: !reason, reason };
}

async function record(q: Queryable, entry: { memberId: string | null; purpose: string; model: string; usage?: Anthropic.Usage; ok: boolean; error?: string }) {
  const usage = entry.usage;
  await q.query("insert into wasl.ai_usage (member_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, ok, error) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [
    entry.memberId, entry.purpose, entry.model, usage?.input_tokens || 0, usage?.output_tokens || 0, usage?.cache_read_input_tokens || 0, usage ? costOf(entry.model, usage) : 0, entry.ok, entry.error?.slice(0, 500) || null,
  ]).catch(() => undefined);
}

let briefCache: { at: number; text: string } | null = null;
/** Who we are, how work flows, who does what: sent with every call so the model knows its place in the team. */
export async function platformBrief(q: Queryable, instructions: string) {
  if (briefCache && Date.now() - briefCache.at < 5 * 60_000 && briefCache.text.endsWith(instructions)) return briefCache.text;
  const settings = (await q.query<{ department_name: string; organization_name: string }>("select department_name, organization_name from wasl.settings where id")).rows[0];
  const companies = (await q.query<{ name: string; short_name: string }>("select name, short_name from wasl.companies where active order by sort_order")).rows;
  const categories = (await q.query<{ name: string }>("select name from wasl.categories where active order by created_at")).rows;
  const text = `منصة «وصل» هي مساحة عمل ${settings?.department_name || "إدارة التواصل الداخلي"}${settings?.organization_name ? ` في ${settings.organization_name}` : ""}. الفريق ينتج أعمال التواصل الداخلي (موشن جرافيك، فيديو، تصميم، تقارير، عروض تقديمية، مستندات) وينشرها على شاشات الشركة وواتساب والبريد الداخلي.
الشركات المستفيدة: ${companies.map((company) => `${company.name} (${company.short_name})`).join("، ") || "—"}.
تصنيفات المحتوى: ${categories.map((category) => category.name).join("، ") || "—"}.
الأدوار: content = كتابة المحتوى والتنسيق (ينشئ الأفكار ويكتب النصوص ويجمع عروض الأسعار)؛ manager = مدير الإدارة (يعتمد الأفكار والمحتوى ويحدد المصمم والموعد)؛ designer = التصميم والإنتاج (يجدول العمل وينفذه ويسلّم النسخ النهائية)؛ admin = مدير النظام (كل صلاحيات مدير الإدارة وإدارة النظام).
مراحل الفكرة: مسودة → (جمع عروض الأسعار) → بانتظار الاعتماد → معتمد → مجدول → قيد التصميم → تم التسليم، وقد تُعاد للتعديل أو تُرفض أو تُلغى. بعد التسليم تُؤرشف الملفات تلقائياً في Google Drive.
الأولويات: urgent عاجلة، high مهمة، normal عادية، low منخفضة. التواريخ بتقويم ميلادي وتوقيت الرياض، وأيام العمل الأحد إلى الخميس.
${instructions ? `تعليمات مدير النظام:
${instructions}` : ""}`;
  briefCache = { at: Date.now(), text };
  return text;
}

/** One structured call with budget accounting. `stable` is cached across calls; `dynamic` is the per-request part. */
export async function askStructured<T extends z.ZodType>(q: Queryable, input: { memberId: string | null; purpose: string; stable: string; dynamic: string; user: string; schema: T; effort?: AiEffort; maxTokens?: number }): Promise<z.infer<T>> {
  const status = await aiStatus(q);
  if (!status.available) throw new AiUnavailable(status.reason || "الميزات الذكية غير متاحة.", !status.configured ? "NO_KEY" : !status.enabled ? "DISABLED" : "BUDGET");
  const api = anthropic()!;
  const model = status.model;
  const brief = await platformBrief(q, status.instructions);
  try {
    const response = await api.messages.parse({
      model,
      max_tokens: input.maxTokens || 2048,
      output_config: { effort: status.effort, format: zodOutputFormat(input.schema) },
      system: [
        { type: "text", text: `${brief}

${input.stable}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: input.dynamic },
      ],
      messages: [{ role: "user", content: input.user }],
    });
    await record(q, { memberId: input.memberId, purpose: input.purpose, model, usage: response.usage, ok: response.stop_reason !== "refusal" && !!response.parsed_output });
    if (response.stop_reason === "refusal") throw new AiUnavailable("رفض النموذج هذا الطلب.", "REFUSED");
    if (!response.parsed_output) throw new AiUnavailable("لم يُرجع النموذج نتيجة صالحة.", "FAILED");
    return response.parsed_output;
  } catch (error) {
    if (error instanceof AiUnavailable) throw error;
    const message = error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error instanceof Error ? error.message : "unknown";
    await record(q, { memberId: input.memberId, purpose: input.purpose, model, ok: false, error: message });
    if (error instanceof Anthropic.AuthenticationError) throw new AiUnavailable("مفتاح Claude API غير صالح.", "NO_KEY");
    if (error instanceof Anthropic.RateLimitError) throw new AiUnavailable("الخدمة مشغولة الآن، أعد المحاولة بعد قليل.", "FAILED");
    throw new AiUnavailable("تعذّر الاتصال بالذكاء الاصطناعي الآن.", "FAILED");
  }
}

export async function recentUsage(q: Queryable = database(), limit = 30) {
  return (await q.query<{ at: Date; member_id: string | null; purpose: string; input_tokens: number; output_tokens: number; cost_usd: string; ok: boolean; error: string | null }>("select at, member_id, purpose, input_tokens, output_tokens, cost_usd::text, ok, error from wasl.ai_usage order by at desc limit $1", [limit])).rows
    .map((row) => ({ at: row.at.toISOString(), memberId: row.member_id, purpose: row.purpose, inputTokens: row.input_tokens, outputTokens: row.output_tokens, costUsd: Number(row.cost_usd), ok: row.ok, error: row.error }));
}

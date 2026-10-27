import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AiStatus } from "@/data/engagement";
import { database, type Queryable } from "./db";

export const AI_MODEL = process.env.WASL_AI_MODEL || "claude-opus-5-5";
const PRICE: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
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
  const price = PRICE[model] || PRICE["claude-opus-5-5"];
  const cached = usage.cache_read_input_tokens || 0, created = usage.cache_creation_input_tokens || 0;
  const plain = Math.max(0, usage.input_tokens - 0);
  return (plain * price.input + created * price.input * 1.25 + cached * price.cacheRead + usage.output_tokens * price.output) / 1_000_000;
}

export async function aiStatus(q: Queryable = database()): Promise<AiStatus> {
  const settings = (await q.query<{ ai_enabled: boolean; ai_budget_usd: string }>("select ai_enabled, ai_budget_usd from wasl.settings where id")).rows[0];
  const month = (await q.query<{ spent: string; calls: string }>("select coalesce(sum(cost_usd), 0)::text as spent, count(*)::text as calls from wasl.ai_usage where to_char(at at time zone 'Asia/Riyadh', 'YYYY-MM') = $1", [RIYADH_MONTH()])).rows[0];
  const configured = Boolean(process.env.ANTHROPIC_API_KEY), enabled = settings?.ai_enabled !== false, budgetUsd = Number(settings?.ai_budget_usd ?? 80), spentUsd = Number(month?.spent || 0);
  const reason = !configured ? "لم يُضبط مفتاح Claude API بعد." : !enabled ? "أوقف مدير النظام الميزات الذكية." : spentUsd >= budgetUsd ? "استُهلكت ميزانية هذا الشهر." : undefined;
  return { configured, enabled, budgetUsd, spentUsd: Math.round(spentUsd * 1000) / 1000, calls: Number(month?.calls || 0), model: AI_MODEL, available: !reason, reason };
}

async function record(q: Queryable, entry: { memberId: string | null; purpose: string; usage?: Anthropic.Usage; ok: boolean; error?: string }) {
  const usage = entry.usage;
  await q.query("insert into wasl.ai_usage (member_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, ok, error) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [
    entry.memberId, entry.purpose, AI_MODEL, usage?.input_tokens || 0, usage?.output_tokens || 0, usage?.cache_read_input_tokens || 0, usage ? costOf(AI_MODEL, usage) : 0, entry.ok, entry.error?.slice(0, 500) || null,
  ]).catch(() => undefined);
}

/** One structured call with budget accounting. `stable` is cached across calls; `dynamic` is the per-request part. */
export async function askStructured<T extends z.ZodType>(q: Queryable, input: { memberId: string | null; purpose: string; stable: string; dynamic: string; user: string; schema: T; effort?: "low" | "medium" | "high"; maxTokens?: number }): Promise<z.infer<T>> {
  const status = await aiStatus(q);
  if (!status.available) throw new AiUnavailable(status.reason || "الميزات الذكية غير متاحة.", !status.configured ? "NO_KEY" : !status.enabled ? "DISABLED" : "BUDGET");
  const api = anthropic()!;
  try {
    const response = await api.messages.parse({
      model: AI_MODEL,
      max_tokens: input.maxTokens || 2048,
      output_config: { effort: input.effort || "low", format: zodOutputFormat(input.schema) },
      system: [
        { type: "text", text: input.stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: input.dynamic },
      ],
      messages: [{ role: "user", content: input.user }],
    });
    await record(q, { memberId: input.memberId, purpose: input.purpose, usage: response.usage, ok: response.stop_reason !== "refusal" && !!response.parsed_output });
    if (response.stop_reason === "refusal") throw new AiUnavailable("رفض النموذج هذا الطلب.", "REFUSED");
    if (!response.parsed_output) throw new AiUnavailable("لم يُرجع النموذج نتيجة صالحة.", "FAILED");
    return response.parsed_output;
  } catch (error) {
    if (error instanceof AiUnavailable) throw error;
    const message = error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error instanceof Error ? error.message : "unknown";
    await record(q, { memberId: input.memberId, purpose: input.purpose, ok: false, error: message });
    if (error instanceof Anthropic.AuthenticationError) throw new AiUnavailable("مفتاح Claude API غير صالح.", "NO_KEY");
    if (error instanceof Anthropic.RateLimitError) throw new AiUnavailable("الخدمة مشغولة الآن، أعد المحاولة بعد قليل.", "FAILED");
    throw new AiUnavailable("تعذّر الاتصال بالذكاء الاصطناعي الآن.", "FAILED");
  }
}

export async function recentUsage(q: Queryable = database(), limit = 30) {
  return (await q.query<{ at: Date; member_id: string | null; purpose: string; input_tokens: number; output_tokens: number; cost_usd: string; ok: boolean; error: string | null }>("select at, member_id, purpose, input_tokens, output_tokens, cost_usd::text, ok, error from wasl.ai_usage order by at desc limit $1", [limit])).rows
    .map((row) => ({ at: row.at.toISOString(), memberId: row.member_id, purpose: row.purpose, inputTokens: row.input_tokens, outputTokens: row.output_tokens, costUsd: Number(row.cost_usd), ok: row.ok, error: row.error }));
}

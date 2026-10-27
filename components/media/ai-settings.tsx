"use client";

import { useEffect, useState } from "react";
import type { AiStatus } from "@/data/engagement";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, errorText } from "./ui";
import { Icon3D } from "./engagement/icons-3d";

type Usage = { at: string; memberId: string | null; purpose: string; inputTokens: number; outputTokens: number; costUsd: number; ok: boolean; error: string | null };
type ModelOption = { id: string; label: string; hint: string; input: number; output: number };
type Status = AiStatus & { usage: Usage[]; models: ModelOption[] };
const EFFORTS: [AiStatus["effort"], string, string][] = [["low", "منخفض", "أسرع وأرخص، ويكفي لتصنيف المهام"], ["medium", "متوسط", "تفكير أعمق في خطط الأفكار"], ["high", "عالٍ", "الأدق والأغلى"]];
const PURPOSES: Record<string, string> = { parse_task: "فهم مهمة", plan_idea: "خطة فكرة", nudge: "تذكير صباحي" };

async function fetchAiStatus(): Promise<Status> {
  const response = await fetch("/api/ai", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "تعذر تحميل الحالة.");
  return body;
}

export default function AiSettings() {
  const members = useMediaStore((store) => store.data.members);
  const [status, setStatus] = useState<Status | null>(null);
  const [budget, setBudget] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchAiStatus()
      .then((body) => {
        if (cancelled) return;
        setStatus(body);
        setBudget(String(body.budgetUsd));
        setInstructions(body.instructions);
      })
      .catch((cause) => !cancelled && setError(errorText(cause)));
    return () => {
      cancelled = true;
    };
  }, []);
  const save = async (patch: { enabled?: boolean; budgetUsd?: number; model?: string; effort?: string; instructions?: string }) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر الحفظ.");
      setStatus(body);
      setBudget(String(body.budgetUsd));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const usd = (value: number) => `$${value.toFixed(2)}`;
  return (
    <section className="media-card space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon3D name="sparkle" className="size-10" />
          <div>
            <h2>الذكاء الاصطناعي في وصل</h2>
            <p className="mt-2 max-w-[48em] text-[var(--soft)]">يفهم المهام المكتوبة بلغة طبيعية ويصنّفها ويربطها بالأفكار، ويقترح خطط التنفيذ، ويكتب التذكيرات الصباحية. يعمل عبر Claude API بمفتاحك وضمن ميزانية شهرية تحددها هنا.</p>
          </div>
        </div>
        {status && (
          <span className={`media-badge ${status.available ? "media-badge-success" : "media-badge-warning"}`}>{status.available ? "يعمل" : status.reason}</span>
        )}
      </div>
      {error && <p role="alert" className="rounded-xl bg-[#fff0f1] p-3 text-sm text-[var(--danger)]">{error}</p>}
      {!status && !error && <p role="status" className="text-sm text-[var(--soft)]">جارٍ التحميل…</p>}
      {status && (
        <>
          {!status.configured && (
            <div className="rounded-xl border border-[#f2c98a] bg-[#fff6e8] p-4 text-sm text-[#7a4b00]">
              لم يُضبط المفتاح بعد. أضف المتغير <bdi className="font-mono">ANTHROPIC_API_KEY</bdi> في إعدادات Netlify (Site configuration → Environment variables) ثم أعد النشر. لا تلصق المفتاح هنا ولا في أي محادثة.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-[var(--background)] p-4">
              <span className="block text-xs text-[var(--soft)]">المصروف هذا الشهر</span>
              <strong className="font-display text-3xl font-medium">{usd(status.spentUsd)}</strong>
              <span className="block text-xs text-[var(--soft)]">من {usd(status.budgetUsd)} · {status.calls.toLocaleString("ar-SA")} طلب</span>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${status.budgetUsd ? Math.min(100, (status.spentUsd / status.budgetUsd) * 100) : 0}%` }} /></div>
            </div>
            <label className="media-label rounded-xl bg-[var(--background)] p-4">
              الميزانية الشهرية بالدولار
              <div className="mt-2 flex gap-2">
                <input type="number" min={0} max={10000} step={1} className="media-input" value={budget} onChange={(event) => setBudget(event.target.value)} />
                <ActionButton disabled={busy || Number(budget) === status.budgetUsd} onClick={() => void save({ budgetUsd: Number(budget) })}>حفظ</ActionButton>
              </div>
              <span className="mt-1 block text-xs font-normal text-[var(--soft)]">يتوقف الذكاء تلقائياً عند بلوغها حتى بداية الشهر التالي.</span>
            </label>
            <div className="rounded-xl bg-[var(--background)] p-4">
              <span className="block text-xs text-[var(--soft)]">الحالة</span>
              <strong className="block">{status.enabled ? "مفعّل" : "متوقف"}</strong>
              <ActionButton className="mt-3" disabled={busy} onClick={() => void save({ enabled: !status.enabled })}>{status.enabled ? "إيقاف الميزات الذكية" : "تشغيل الميزات الذكية"}</ActionButton>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="rounded-xl bg-[var(--background)] p-4">
              <legend className="media-label">النموذج</legend>
              <div className="space-y-2">
                {status.models.map((model) => (
                  <label key={model.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${status.model === model.id ? "border-[#a99beb] bg-[var(--accent)]" : "border-[var(--border)] bg-white"}`}>
                    <input type="radio" name="ai-model" className="mt-1 accent-[var(--primary)]" checked={status.model === model.id} disabled={busy} onChange={() => void save({ model: model.id })} />
                    <span>
                      <span className="block font-medium">{model.label}</span>
                      <span className="block text-xs text-[var(--soft)]">{model.hint} · ${model.input} / ${model.output} لكل مليون رمز (إدخال / إخراج)</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="rounded-xl bg-[var(--background)] p-4">
              <legend className="media-label">جهد التفكير</legend>
              <div className="space-y-2">
                {EFFORTS.map(([id, label, hint]) => (
                  <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${status.effort === id ? "border-[#a99beb] bg-[var(--accent)]" : "border-[var(--border)] bg-white"}`}>
                    <input type="radio" name="ai-effort" className="mt-1 accent-[var(--primary)]" checked={status.effort === id} disabled={busy} onChange={() => void save({ effort: id })} />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="block text-xs text-[var(--soft)]">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--soft)]">كل طلب يُسجَّل بتكلفته في الجدول أدناه، فجرّب الإعداد وراقب الفرق.</p>
            </fieldset>
          </div>
          <label className="media-label block rounded-xl bg-[var(--background)] p-4">
            تعليماتك للنموذج
            <textarea className="media-input mt-2 min-h-28 resize-y text-sm" maxLength={6000} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="مثال: أسند مهام الفيديو دائماً لعمر، واعتبر «رسالة الجمعة» عنواناً وليس موعداً، وفضّل المواعيد قبل الخميس." />
            <span className="mt-1 block text-xs font-normal text-[var(--soft)]">تُرسل مع كل طلب إلى جانب وصف المنصة والفريق ومراحل العمل، وتُطبَّق على فهم المهام واقتراح الخطط والتذكيرات.</span>
            <ActionButton className="mt-2" disabled={busy || instructions.trim() === status.instructions} onClick={() => void save({ instructions })}>حفظ التعليمات</ActionButton>
          </label>
          <div>
            <h3 className="mb-2 text-sm font-bold">آخر الطلبات</h3>
            {status.usage.length === 0 ? (
              <p className="text-sm text-[var(--soft)]">لا طلبات بعد.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32em] text-sm">
                  <thead className="text-xs text-[var(--soft)]"><tr><th className="p-2 text-start font-medium">الوقت</th><th className="p-2 text-start font-medium">العضو</th><th className="p-2 text-start font-medium">الغرض</th><th className="p-2 font-medium">الرموز</th><th className="p-2 font-medium">التكلفة</th><th className="p-2 font-medium">النتيجة</th></tr></thead>
                  <tbody>
                    {status.usage.map((row, index) => (
                      <tr key={index} className="border-t border-[var(--border)]">
                        <td className="p-2 whitespace-nowrap">{new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(row.at))}</td>
                        <td className="p-2">{members.find((member) => member.id === row.memberId)?.name || "النظام"}</td>
                        <td className="p-2">{PURPOSES[row.purpose] || row.purpose}</td>
                        <td className="p-2 text-center tabular-nums">{(row.inputTokens + row.outputTokens).toLocaleString("ar-SA")}</td>
                        <td className="p-2 text-center tabular-nums">{usd(row.costUsd)}</td>
                        <td className="p-2 text-center">{row.ok ? "✓" : <span title={row.error || ""} className="text-[var(--danger)]">فشل</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

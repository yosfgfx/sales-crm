"use client";

import { useEffect, useState } from "react";
import type { AiStatus } from "@/data/engagement";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, errorText } from "./ui";
import { Icon3D } from "./engagement/icons-3d";

type Usage = { at: string; memberId: string | null; purpose: string; inputTokens: number; outputTokens: number; costUsd: number; ok: boolean; error: string | null };
const PURPOSES: Record<string, string> = { parse_task: "فهم مهمة", plan_idea: "خطة فكرة", nudge: "تذكير صباحي" };

export default function AiSettings() {
  const members = useMediaStore((store) => store.data.members);
  const [status, setStatus] = useState<(AiStatus & { usage: Usage[] }) | null>(null);
  const [budget, setBudget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await fetch("/api/ai", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "تعذر تحميل الحالة.");
    setStatus(body);
    setBudget(String(body.budgetUsd));
  };
  useEffect(() => {
    void load().catch((cause) => setError(errorText(cause)));
  }, []);
  const save = async (patch: { enabled?: boolean; budgetUsd?: number }) => {
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
              <span className="block text-xs text-[var(--soft)]">النموذج</span>
              <bdi className="block font-mono text-sm">{status.model}</bdi>
              <ActionButton className="mt-3" disabled={busy} onClick={() => void save({ enabled: !status.enabled })}>{status.enabled ? "إيقاف الميزات الذكية" : "تشغيل الميزات الذكية"}</ActionButton>
            </div>
          </div>
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

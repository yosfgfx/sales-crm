"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest, postJson } from "@/lib/api-client";
import { formatMediaDate } from "@/lib/media-workflow";
import { ActionButton, errorText } from "./ui";

type Key = { id: string; owner: string; ownerId: string; kind: "key" | "oauth"; name: string; prefix: string; createdAt: string; expiresAt: string; lastUsedAt: string | null };
type Entry = { id: string; member: string | null; channel: string; action: string; target: string | null; status: number | null; at: string };
type Access = { policy: "admins" | "everyone"; canManagePolicy: boolean; mcpUrl: string; apiBase: string; keys: Key[]; audit: Entry[] };

const call = <T,>(body: Record<string, unknown>) => postJson<T>("/api/api-access", body);
const when = (value?: string | null) => (value ? formatMediaDate(value) : "—");

function Copy({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code dir="ltr" className="min-w-0 flex-1 break-all rounded-lg bg-[var(--background)] px-3 py-2 text-xs">{value}</code>
      <ActionButton className="!text-xs" aria-label={`نسخ ${label}`} onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>{done ? "نُسخ" : "نسخ"}</ActionButton>
    </div>
  );
}

export default function ApiAccess({ compact = false }: { compact?: boolean }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", days: "90", code: "" });
  const [created, setCreated] = useState<string | null>(null);

  const load = useCallback(() => apiRequest<Access>("/api/api-access").then(setAccess, (error) => { if ((error as { status?: number }).status === 403) setHidden(true); else setMessage(errorText(error)); }), []);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); await load(); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await call<{ token: string }>({ action: "create", name: form.name, days: Number(form.days), code: form.code });
      setCreated(result.token);
      setForm({ name: "", days: "90", code: "" });
    }, "أُنشئ المفتاح. انسخه الآن، فلن يظهر مرة أخرى.");
  };

  if (hidden) return null;
  if (!access) return <div className="media-card p-6 text-[var(--soft)]">{message || "جارٍ تحميل إعدادات الوصول البرمجي…"}</div>;
  const keys = access.keys.filter((key) => key.kind === "key");
  const apps = access.keys.filter((key) => key.kind === "oauth");
  const command = `claude mcp add --transport http wasl ${access.mcpUrl}`;
  return (
    <section className={compact ? "space-y-4" : "media-card max-w-[64em] space-y-6 p-6"} aria-labelledby="api-heading">
      <div className="space-y-1">
        <h2 id="api-heading" className={compact ? "!text-base" : undefined}>الوصول البرمجي وMCP</h2>
        <p className="text-sm text-[var(--soft)]">يربط وصل بالمساعدات الذكية وبالبرامج الأخرى. كل اتصال يعمل بصلاحيات صاحبه فقط، ويُسجَّل كل ما ينفذه.</p>
      </div>

      {access.canManagePolicy && (
        <fieldset className="space-y-2 rounded-xl border border-[var(--border)] p-4">
          <legend className="px-1 text-sm font-medium">من يرى هذه الأدوات ويستخدمها</legend>
          {(["admins", "everyone"] as const).map((policy) => (
            <label key={policy} className="flex items-start gap-2 text-sm">
              <input type="radio" name="api-policy" className="mt-1" checked={access.policy === policy} disabled={busy}
                onChange={() => void run(() => call({ action: "policy", policy }), policy === "everyone" ? "أصبح الوصول البرمجي متاحاً للفريق بصلاحيات كل عضو." : "أصبح الوصول البرمجي لمديري النظام فقط، وأُلغيت مفاتيح بقية الفريق.")} />
              <span>{policy === "admins" ? "مديرو النظام فقط (الافتراضي)" : "كل الفريق، وكل عضو بصلاحيات دوره"}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="!text-base">عنوان خادم MCP</h3>
        <Copy value={access.mcpUrl} label="عنوان MCP" />
        <ul className="list-disc space-y-2 ps-6 text-sm">
          <li><b>Claude على الجوال والويب والحاسب:</b> الإعدادات ← Connectors ← Add custom connector، ثم الصق العنوان واضغط Connect. تُفتح صفحة وصل فتسجّل الدخول وتوافق برمز التحقق.</li>
          <li><b>Claude Code:</b> نفّذ الأمر التالي، ثم اكتب <bdi dir="ltr">/mcp</bdi> واختر wasl لتسجيل الدخول.</li>
        </ul>
        <Copy value={command} label="أمر Claude Code" />
        <p className="text-sm"><b>ChatGPT وCursor وأي تطبيق يدعم MCP:</b> أضف العنوان نفسه. يسجّل الدخول عبر OAuth، أو يرسل مفتاحاً في الترويسة <bdi dir="ltr">Authorization: Bearer</bdi>.</p>
        <p className="text-sm"><b>واجهة REST:</b> العنوان الأساسي <bdi dir="ltr">{access.apiBase}</bdi> بالترويسة نفسها، مثل <bdi dir="ltr">GET /api/media</bdi> و<bdi dir="ltr">POST /api/ops</bdi>.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="!text-base">مفاتيح الوصول</h3>
        <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" onSubmit={create}>
          <label className="media-label !mb-0">اسم المفتاح
            <input className="media-input mt-2" required maxLength={80} placeholder="مثال: Claude Code على جهازي" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="media-label !mb-0">الصلاحية
            <select className="media-input mt-2" value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })}>
              <option value="30">30 يوماً</option><option value="90">90 يوماً</option><option value="365">سنة</option>
            </select>
          </label>
          <label className="media-label !mb-0">رمز التحقق
            <input className="media-input mt-2 text-center" dir="ltr" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
          </label>
          <ActionButton primary type="submit" disabled={busy}>إنشاء مفتاح</ActionButton>
        </form>
        {created && (
          <div role="status" className="space-y-2 rounded-lg border border-[#f2c98a] bg-[#fff6e8] p-3 text-sm text-[#7a4b00]">
            <p>هذا المفتاح يظهر مرة واحدة. احفظه في مكان آمن، ولا تشاركه في المحادثات أو الملفات.</p>
            <Copy value={created} label="المفتاح" />
            <ActionButton className="!text-xs" onClick={() => setCreated(null)}>أخفيته وحفظته</ActionButton>
          </div>
        )}
        <KeyList items={keys} empty="لا توجد مفاتيح فعّالة." busy={busy} onRevoke={(key) => void run(() => call({ action: "revoke", id: key.id }), "أُلغي المفتاح فوراً.")} />
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="!text-base">التطبيقات المربوطة</h3>
        <KeyList items={apps} empty="لم يُربط أي تطبيق بعد." busy={busy} onRevoke={(key) => void run(() => call({ action: "revoke", id: key.id }), "أُلغي ربط التطبيق.")} />
      </div>

      <details className="rounded-xl border border-[var(--border)] p-4">
        <summary className="cursor-pointer text-sm font-medium">سجل الاستخدام (آخر {access.audit.length})</summary>
        <ul className="mt-3 space-y-1 text-xs">
          {access.audit.map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-x-3 border-b border-[var(--border)] py-1">
              <span className="text-[var(--soft)]">{when(entry.at)}</span><span>{entry.member || "—"}</span>
              <bdi dir="ltr">{entry.channel.toUpperCase()} · {entry.action}</bdi>{entry.target && <bdi dir="ltr" className="text-[var(--soft)]">{entry.target}</bdi>}
              {entry.status && entry.status >= 400 && <span className="text-[var(--danger)]">فشل ({entry.status})</span>}
            </li>
          ))}
        </ul>
      </details>
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}

function KeyList({ items, empty, busy, onRevoke }: { items: Key[]; empty: string; busy: boolean; onRevoke: (key: Key) => void }) {
  if (!items.length) return <p className="text-sm text-[var(--soft)]">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((key) => (
        <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--background)] p-3 text-sm">
          <div className="min-w-0 space-y-1">
            <p className="font-medium"><bdi>{key.name}</bdi> <bdi dir="ltr" className="text-xs text-[var(--soft)]">{key.prefix}</bdi></p>
            <p className="text-xs text-[var(--soft)]">{key.owner} · أُنشئ {when(key.createdAt)} · آخر استخدام {when(key.lastUsedAt)}{key.kind === "key" ? ` · ينتهي ${when(key.expiresAt)}` : ""}</p>
          </div>
          <ActionButton className="!text-xs !text-[var(--danger)]" disabled={busy} onClick={() => onRevoke(key)}>إلغاء</ActionButton>
        </li>
      ))}
    </ul>
  );
}

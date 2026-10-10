"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, postJson } from "@/lib/api-client";
import { pickFromDrive } from "@/lib/drive-picker";
import { formatMediaDate } from "@/lib/media-workflow";
import { ActionButton, Icon, errorText } from "./ui";

interface Issue { ideaId: string; code: string; title: string; status: string; error: string | null }
interface Status {
  connected: boolean; folderSelected: boolean; canConnect?: boolean; accountEmail?: string | null; connectedAt?: string | null;
  rootFolder?: { id: string; name: string | null; url: string } | null; lastCheckAt?: string | null; lastCheckOk?: boolean | null;
  pendingJobs?: number; lastBackup?: string | null; issues?: Issue[]; pickerConfigured?: boolean;
}
const call = <T,>(body?: Record<string, unknown>) => (body ? postJson<T>("/api/integrations/google", body) : apiRequest<T>("/api/integrations/google"));

const STATUS_TEXT: Record<string, string> = { failed: "ستُعاد المحاولة تلقائياً", needs_review: "تحتاج مراجعتك" };

const backupLate = (date?: string | null) => !date || Date.now() - Date.parse(`${date}T00:00:00+03:00`) > 2 * 86_400_000;

export default function DriveIntegration({ notice }: { notice?: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(notice || "");
  const [moveExisting, setMoveExisting] = useState(true);
  const load = useCallback(() => call<Status>().then(setStatus, (error) => setMessage(errorText(error))), []);
  useEffect(() => {
    let active = true;
    call<Status>().then((value) => { if (active) setStatus(value); }, (error) => { if (active) setMessage(errorText(error)); });
    return () => { active = false; };
  }, []);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); await load(); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const mode = moveExisting ? "move" : "fresh";
  const choose = () => run(async () => {
    const folder = await pickFromDrive("folder", "اختر مجلد أرشيف وصل");
    if (!folder) throw new Error("لم يُختر مجلد.");
    await call({ action: "selectFolder", folderId: folder.id, mode });
  }, "حُدِّد مجلد الأرشيف.");

  if (!status) return <div className="media-card p-6 text-[var(--soft)]">جارٍ تحميل حالة Google Drive…</div>;
  const hasPrevious = Boolean(status.rootFolder);
  return (
    <section className="media-card max-w-[60em] space-y-6 p-6" aria-labelledby="drive-heading">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-[var(--accent)] p-3 text-[var(--primary)]"><Icon name="archive" className="size-6" /></span>
        <div>
          <h2 id="drive-heading">أرشيف Google Drive</h2>
          <p className="mt-1 text-[var(--soft)]">تُحفظ ملفات كل مشروع في مجلده داخل Drive، ويُنقل عند التسليم إلى مجلد شهر التسليم ثم الشركة. لا يستعرض الفريق Drive من داخل النظام.</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] p-5 space-y-3">
        <h3 className="!text-base">الحساب المربوط</h3>
        {status.connected ? (
          <p>مربوط بحساب <bdi dir="ltr">{status.accountEmail || "—"}</bdi>{status.connectedAt ? ` منذ ${formatMediaDate(String(status.connectedAt))}` : ""}.</p>
        ) : (
          <p className="text-[var(--soft)]">لم يُربط Google Drive بعد. تُحفظ الملفات على الخادم مؤقتاً، وتُرفع إلى Drive تلقائياً عند الأرشفة بعد الربط.</p>
        )}
        {status.canConnect ? (
          <div className="flex flex-wrap gap-2">
            <a href="/api/integrations/google/start" className="media-button media-button-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2.5 text-sm">
              <Icon name="upload" className="size-4" />{status.connected ? "إعادة ربط حساب Google" : "ربط Google Drive"}
            </a>
            {status.connected && (
              <ActionButton onClick={() => { if (window.confirm("فصل Google Drive يوقف الرفع والأرشفة حتى إعادة الربط. تبقى الملفات في Drive كما هي. هل تريد الفصل؟")) void run(() => call({ action: "disconnect" }), "فُصل Google Drive."); }} disabled={busy} className="!text-[var(--danger)]">
                فصل الربط
              </ActionButton>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--soft)]">ربط الحساب وفصله متاحان لمالك النظام فقط.</p>
        )}
      </div>

      {status.connected && (
        <div className="rounded-xl border border-[var(--border)] p-5 space-y-3">
          <h3 className="!text-base">مجلد الأرشيف</h3>
          {status.rootFolder ? (
            <p>المجلد الحالي: <a className="text-[var(--primary)] underline underline-offset-4" href={status.rootFolder.url} target="_blank" rel="noopener noreferrer"><bdi>{status.rootFolder.name || status.rootFolder.id}</bdi></a></p>
          ) : (
            <p className="text-[var(--soft)]">لم يُحدَّد مجلد بعد. أنشئ مجلد WaslPlatform، أو اختر مجلداً موجوداً في Drive.</p>
          )}
          {hasPrevious && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={moveExisting} onChange={(event) => setMoveExisting(event.target.checked)} />
              عند تغيير المجلد، انقل الأرشيف الحالي إليه
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => run(() => call({ action: "createDefaultFolder", mode }), "أُنشئ مجلد WaslPlatform واعتُمد للأرشيف.")} disabled={busy}>إنشاء مجلد WaslPlatform</ActionButton>
            <ActionButton onClick={choose} disabled={busy || !status.pickerConfigured}>اختيار مجلد من Drive</ActionButton>
            <ActionButton onClick={() => run(async () => { const result = await call<{ quota: { limit: number; usage: number } }>({ action: "test" }); const free = result.quota.limit ? ((result.quota.limit - result.quota.usage) / 1024 ** 3).toFixed(1) : null; setMessage(free ? `الاتصال سليم. المساحة المتاحة ${free} جيجابايت.` : "الاتصال سليم."); }, "الاتصال سليم.")} disabled={busy}>اختبار الاتصال</ActionButton>
          </div>
          {status.lastCheckAt && <p className="text-xs text-[var(--soft)]">آخر فحص: {formatMediaDate(String(status.lastCheckAt))} · {status.lastCheckOk ? "سليم" : "فشل"}</p>}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] p-5 space-y-3">
        <h3 className="!text-base">حالة الأرشفة</h3>
        <p className="text-sm text-[var(--soft)]">أعمال بانتظار الأرشفة: {status.pendingJobs ?? 0}</p>
        {status.folderSelected && (
          <p className={`text-sm ${backupLate(status.lastBackup) ? "text-[var(--danger)]" : "text-[var(--soft)]"}`}>
            آخر نسخة احتياطية: {status.lastBackup ? formatMediaDate(status.lastBackup) : "لم تُحفظ بعد"}
            {backupLate(status.lastBackup) && " · متأخرة، راجع ربط Drive ومفتاح التشفير على الخادم"}
          </p>
        )}
        {status.issues?.length ? (
          <ul className="space-y-2">
            {status.issues.map((issue) => (
              <li key={issue.ideaId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--background)] p-3">
                <div className="min-w-0">
                  <p className="font-medium"><bdi>{issue.code}</bdi> · {issue.title}</p>
                  <p className="text-xs text-[var(--soft)]">{STATUS_TEXT[issue.status] || issue.status}{issue.error ? ` · ${issue.error}` : ""}</p>
                </div>
                <ActionButton onClick={() => run(() => call({ action: "retryArchive", ideaId: issue.ideaId }), "أُعيدت محاولة الأرشفة.")} disabled={busy}>إعادة المحاولة</ActionButton>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm">لا توجد مشكلات أرشفة.</p>}
      </div>

      {message && <div role="status" className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">{message}</div>}
    </section>
  );
}

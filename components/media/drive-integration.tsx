"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMediaDate } from "@/lib/media-workflow";
import { ActionButton, Icon, errorText } from "./ui";

interface Issue { ideaId: string; code: string; title: string; status: string; error: string | null }
interface Status {
  connected: boolean; folderSelected: boolean; canConnect?: boolean; accountEmail?: string | null; connectedAt?: string | null;
  rootFolder?: { id: string; name: string | null; url: string } | null; lastCheckAt?: string | null; lastCheckOk?: boolean | null;
  pendingJobs?: number; issues?: Issue[]; pickerConfigured?: boolean;
}
type PickerResult = { action: string; docs?: { id: string; name: string }[] };
type PickerBuilder = { addView(view: unknown): PickerBuilder; setOAuthToken(token: string): PickerBuilder; setDeveloperKey(key: string): PickerBuilder; setAppId(id: string): PickerBuilder; setLocale(locale: string): PickerBuilder; setTitle(title: string): PickerBuilder; setCallback(callback: (result: PickerResult) => void): PickerBuilder; build(): { setVisible(visible: boolean): void } };
declare global {
  interface Window {
    gapi?: { load(name: string, callback: () => void): void };
    google?: { picker: { PickerBuilder: new () => PickerBuilder; DocsView: new (viewId: unknown) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMimeTypes(v: string): unknown }; ViewId: { FOLDERS: unknown }; Action: { PICKED: string } } };
  }
}

async function call<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/integrations/google", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  let payload: T & { error?: string };
  try { payload = await response.json(); } catch { throw new Error("تعذّر الوصول إلى النظام الآن. أعد المحاولة بعد قليل."); }
  if (!response.ok) throw new Error(payload.error || "تعذّر تنفيذ الطلب.");
  return payload;
}

let pickerReady: Promise<void> | null = null;
function loadPicker() {
  if (!pickerReady) pickerReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => window.gapi?.load("picker", () => resolve());
    script.onerror = () => { pickerReady = null; reject(new Error("تعذّر تحميل نافذة Google Drive. تحقق من الاتصال.")); };
    document.head.appendChild(script);
  });
  return pickerReady;
}

const STATUS_TEXT: Record<string, string> = { failed: "ستُعاد المحاولة تلقائياً", needs_review: "تحتاج مراجعتك" };

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
    const { accessToken, apiKey, appId } = await call<{ accessToken: string; apiKey: string; appId: string }>({ action: "pickerToken" });
    await loadPicker();
    const picker = window.google!.picker;
    const folder = await new Promise<{ id: string } | null>((resolve) => {
      const view = new picker.DocsView(picker.ViewId.FOLDERS);
      view.setIncludeFolders(true); view.setSelectFolderEnabled(true); view.setMimeTypes("application/vnd.google-apps.folder");
      new picker.PickerBuilder().addView(view).setOAuthToken(accessToken).setDeveloperKey(apiKey).setAppId(appId).setLocale("ar").setTitle("اختر مجلد أرشيف وصل")
        .setCallback((result) => { if (result.action === picker.Action.PICKED) resolve(result.docs?.[0] || null); else if (result.action === "cancel") resolve(null); }).build().setVisible(true);
    });
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

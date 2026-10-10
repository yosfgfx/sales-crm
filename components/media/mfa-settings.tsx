"use client";

import Asset from "@/components/_ui/asset";
import { useState } from "react";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, errorText } from "./ui";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let payload: T & { error?: string };
  try { payload = await response.json(); } catch { throw new Error("تعذّر الوصول إلى النظام الآن. أعد المحاولة بعد قليل."); }
  if (!response.ok) throw new Error(payload.error || "تعذّر تنفيذ الطلب.");
  return payload;
}

export default function MfaSettings() {
  const mfa = useMediaStore((store) => store.mfa);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  if (!mfa) return null;
  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] p-4" aria-labelledby="mfa-heading">
      <h3 id="mfa-heading" className="!text-base">التحقق بخطوتين</h3>
      {mfa.enabled ? (
        <>
          <p className="text-sm">مفعّل. يطلب النظام رمزاً من تطبيق المصادقة عند كل دخول.</p>
          {!mfa.required && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void run(async () => { await call({ action: "disable", code }); setCode(""); await useMediaStore.getState().refresh(); setMessage("أُوقف التحقق بخطوتين."); }); }}>
              <label className="media-label !mb-0">رمز من التطبيق لإيقافه
                <input className="media-input mt-2 !w-36 text-center" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} dir="ltr" />
              </label>
              <ActionButton type="submit" disabled={busy}>إيقاف</ActionButton>
            </form>
          )}
        </>
      ) : setup ? (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run(async () => { await call({ action: "confirm", code }); setSetup(null); setCode(""); await useMediaStore.getState().refresh(); setMessage("فُعّل التحقق بخطوتين."); }); }}>
          <p className="text-sm">امسح الرمز بتطبيق Google Authenticator أو Microsoft Authenticator، ثم اكتب الرمز المكوّن من 6 أرقام.</p>
          <Asset type="image" src={setup.qr} alt="رمز QR لإضافة حساب وصل إلى تطبيق المصادقة" width={1} height={1} fit="contain" className="max-w-44 rounded-lg border border-[var(--border)]" />
          <p className="text-xs text-[var(--soft)]">أو أدخل المفتاح يدوياً: <bdi dir="ltr" className="font-mono select-all">{setup.secret}</bdi></p>
          <label className="media-label">الرمز من التطبيق
            <input className="media-input mt-2 !w-36 text-center" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} dir="ltr" />
          </label>
          <ActionButton type="submit" primary disabled={busy}>تأكيد التفعيل</ActionButton>
        </form>
      ) : (
        <>
          <p className="text-sm">{mfa.required ? "إلزامي لمديري النظام قبل استخدام أدوات الإدارة." : "يحمي حسابك إن تسرّبت كلمة المرور."}</p>
          <ActionButton primary disabled={busy} onClick={() => void run(async () => { setSetup(await call<{ secret: string; qr: string }>({ action: "start" })); })}>تفعيل التحقق بخطوتين</ActionButton>
        </>
      )}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}

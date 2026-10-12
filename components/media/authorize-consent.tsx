"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, postJson } from "@/lib/api-client";
import { ActionButton, errorText } from "./ui";

type Params = Record<"response_type" | "client_id" | "redirect_uri" | "code_challenge" | "code_challenge_method" | "state" | "scope" | "resource", string>;
type Session = { user: { id: string; name: string; role: string } | null; mfa: { enabled: boolean } | null };

export default function AuthorizeConsent({ params }: { params: Params }) {
  const [client, setClient] = useState<{ name: string; redirectHost: string } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "", code: "", needsCode: false });
  const [code, setCode] = useState("");

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ client_id: params.client_id, redirect_uri: params.redirect_uri });
    Promise.all([apiRequest<{ name: string; redirectHost: string }>(`/api/oauth/authorize?${query}`), apiRequest<Session>("/api/session")])
      .then(([info, current]) => { if (active) { setClient(info); setSession(current); } })
      .catch((reason) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [params.client_id, params.redirect_uri]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await postJson("/api/session", { username: login.username, password: login.password, ...(login.code ? { code: login.code } : {}) });
      setSession(await apiRequest<Session>("/api/session"));
    } catch (reason) {
      if ((reason as { code?: string }).code === "MFA_REQUIRED") setLogin((value) => ({ ...value, needsCode: true }));
      else setError(errorText(reason));
    } finally { setBusy(false); }
  };

  const decide = async (approve: boolean) => {
    setBusy(true); setError("");
    try {
      const result = await postJson<{ redirect: string }>("/api/oauth/authorize", { ...params, approve, code });
      window.location.assign(result.redirect);
    } catch (reason) { setError(errorText(reason)); setBusy(false); }
  };

  const invalid = params.response_type !== "code" || !params.client_id || !params.redirect_uri;
  return (
    <main className="media-card w-full max-w-[30em] space-y-5 p-6">
      <h1 className="!text-2xl">ربط تطبيق بنظام وصل</h1>
      {invalid ? (
        <p role="alert" className="text-[var(--danger)]">رابط الربط ناقص. ابدأ الربط من التطبيق مجدداً.</p>
      ) : !client || !session ? (
        error ? <p role="alert" className="text-[var(--danger)]">{error}</p> : <p className="text-[var(--soft)]">جارٍ التحقق من طلب الربط…</p>
      ) : !session.user ? (
        <form className="space-y-4" onSubmit={signIn}>
          <p>سجّل الدخول بحساب مدير النظام لمتابعة ربط «{client.name}».</p>
          <label className="media-label">اسم تسجيل الدخول
            <input className="media-input mt-2" dir="ltr" required autoComplete="username" value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} />
          </label>
          <label className="media-label">كلمة المرور
            <input className="media-input mt-2" type="password" required autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
          </label>
          {login.needsCode && (
            <label className="media-label">رمز التحقق من تطبيق المصادقة
              <input className="media-input mt-2 text-center" dir="ltr" required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={login.code} onChange={(event) => setLogin({ ...login, code: event.target.value })} />
            </label>
          )}
          {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
          <ActionButton primary type="submit" disabled={busy} className="w-full">دخول</ActionButton>
        </form>
      ) : (
        <div className="space-y-4">
          <p>
            يطلب <b><bdi>{client.name}</bdi></b> الوصول إلى نظام وصل باسم <b>{session.user.name}</b>، وبالصلاحيات نفسها التي يملكها حسابك.
          </p>
          <ul className="list-disc space-y-1 ps-6 text-sm text-[var(--soft)]">
            <li>يستطيع قراءة الأفكار والملفات وتنفيذ الإجراءات المسموحة لحسابك.</li>
            <li>تعود النتائج إلى: <bdi dir="ltr">{client.redirectHost}</bdi></li>
            <li>تلغي الربط في أي وقت من «إدارة النظام» ← «API وMCP».</li>
          </ul>
          <label className="media-label">رمز جديد من تطبيق المصادقة
            <input className="media-input mt-2 text-center" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <p className="text-xs text-[var(--soft)]">إن دخلت قبل لحظات، انتظر حتى يتغير الرمز في التطبيق ثم أدخل الجديد.</p>
          {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <ActionButton primary disabled={busy || !/^\d{6}$/.test(code)} onClick={() => void decide(true)}>السماح بالربط</ActionButton>
            <ActionButton disabled={busy} onClick={() => void decide(false)}>رفض</ActionButton>
          </div>
        </div>
      )}
    </main>
  );
}

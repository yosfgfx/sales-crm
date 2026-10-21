"use client";

import type { Dispatch, SetStateAction } from "react";
import { useMediaStore, type MediaState } from "@/stores/media-store";
import { isFormerMember, memberDisplayLabel, type MediaData } from "@/data/media";
import { ActionButton, Icon, errorText } from "../ui";

type Setter<T> = Dispatch<SetStateAction<T>>;

export function LoginScreen({
  store,
  data,
  demo,
  error,
  saving,
  loginMember,
  setLoginMember,
  password,
  setPassword,
  mfaCode,
  setMfaCode,
  mfaNeeded,
  setMfaNeeded,
  notice,
  setNotice,
}: {
  store: MediaState;
  data: MediaData;
  demo: boolean;
  error: string | null;
  saving: boolean;
  loginMember: string;
  setLoginMember: Setter<string>;
  password: string;
  setPassword: Setter<string>;
  mfaCode: string;
  setMfaCode: Setter<string>;
  mfaNeeded: boolean;
  setMfaNeeded: Setter<boolean>;
  notice: string;
  setNotice: Setter<string>;
}) {
  return (
    <div
      dir="rtl"
      className="media-app flex min-h-dvh items-center justify-center px-4"
    >
      <form
        className="media-card w-full max-w-[30em] space-y-5 p-8"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            try {
              await store.setCurrentUser(loginMember, password, mfaNeeded ? mfaCode : undefined);
              setPassword(""); setMfaCode(""); setMfaNeeded(false); setNotice("");
            } catch (e) {
              if (e instanceof Error && "code" in e && e.code === "MFA_REQUIRED") { setMfaNeeded(true); setNotice(""); useMediaStore.setState({ error: null }); }
              else setNotice(errorText(e));
            }
          })();
        }}
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
          <Icon name="spark" className="size-8" />
        </div>
        <h1>مرحبًا بك في وصْل</h1>
        <p className="text-[var(--soft)]">
          مساحة فريق التواصل الداخلي، من أول فكرة إلى آخر تسليم.
        </p>
        {demo ? (
          <label className="media-label">
            حساب الفريق
            <select
              className="media-input mt-2"
              value={loginMember}
              onChange={(e) => setLoginMember(e.target.value)}
            >
              {data.members.filter((member) => !isFormerMember(member)).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {memberDisplayLabel(member)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="media-label">
            اسم تسجيل الدخول
            <input
              className="media-input mt-2"
              dir="ltr"
              required
              autoComplete="username"
              name="username"
              value={loginMember}
              onChange={(e) => setLoginMember(e.target.value)}
              placeholder="اسم الدخول الذي حدده مسؤول النظام"
            />
          </label>
        )}
        {!demo && (
          <label className="media-label">
            كلمة المرور
            <input
              className="media-input mt-2"
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {mfaNeeded && (
          <label className="media-label">
            رمز التحقق من تطبيق المصادقة
            <input
              className="media-input mt-2 text-center"
              dir="ltr"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />
          </label>
        )}
        {(error || notice) && (
          <p role="alert" className="text-[var(--danger)]">
            {notice || error}
          </p>
        )}
        <ActionButton
          primary
          type="submit"
          disabled={saving}
          className="w-full"
        >
          {saving ? "جارٍ الدخول…" : "دخول مساحة العمل"}
          <Icon name="arrow" />
        </ActionButton>
        {demo && (
          <p className="text-xs text-[var(--soft)]">
            وضع تجريبي لاستعراض الأدوار. تُفعّل حسابات الفريق المحمية من
            إعدادات الخادم.
          </p>
        )}
      </form>
    </div>
  );
}

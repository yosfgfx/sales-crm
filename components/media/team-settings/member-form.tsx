"use client";

import { useState } from "react";
import {
  ROLE_LABELS,
  type AccountSummary,
  type MemberRole,
  type TeamMember,
} from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, errorText } from "../ui";

export function MemberForm({
  member,
  account,
  onDone,
}: {
  member?: TeamMember;
  account?: AccountSummary;
  onDone: (message: string) => void;
}) {
  const store = useMediaStore();
  const protectedAccount = member?.role === "superadmin" || account?.protected;
  const mustSetPassword = !member || account?.hasPassword === false;
  const [name, setName] = useState(member?.name || "");
  const [title, setTitle] = useState(member?.title || "");
  const [username, setUsername] = useState(
    account?.username || member?.id || "",
  );
  const [role, setRole] = useState<Exclude<MemberRole, "superadmin">>(
    member?.role === "superadmin" ? "admin" : member?.role || "content",
  );
  const [active, setActive] = useState(member?.active ?? true);
  const [addressForm, setAddressForm] = useState<"m" | "f">(member?.addressForm === "f" ? "f" : "m");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(account?.email || "");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [baseline] = useState(
    member
      ? {
          name: member.name,
          title: member.title,
          role: member.role,
          active: member.active,
          username: account?.username || member.id,
        }
      : undefined,
  );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (password !== confirmation) {
          setError("كلمتا المرور غير متطابقتين.");
          return;
        }
        const minimum = role === "admin" || member?.role === "superadmin" ? 12 : 10;
        if ((mustSetPassword || password) && password.length < minimum) {
          setError(`استخدم كلمة مرور من ${minimum} أحرف على الأقل.`);
          return;
        }
        setBusy(true);
        setError("");
        try {
          if (member) {
            await store.updateAccount(
              member.id,
              {
                name,
                title,
                ...(!protectedAccount ? { role, active, username } : {}),
                ...(password ? { password } : {}),
                email,
              },
              baseline,
            );
            if ((member.addressForm === "f" ? "f" : "m") !== addressForm) await saveAddressForm(member.id, addressForm);
            onDone(
              "حُفظت بيانات الحساب. إذا تغيّرت بيانات دخوله، يستخدم المستخدم البيانات الجديدة لتسجيل الدخول.",
            );
          } else {
            const created = await store.createAccount({
              name,
              title,
              role,
              username,
              password,
              email,
            });
            if (addressForm === "f") await saveAddressForm(created.id, addressForm);
            onDone(
              "أُضيف " +
                created.name +
                " وأصبح بإمكانه الدخول باستخدام اسم الحساب الذي حددته.",
            );
          }
          setPassword("");
          setConfirmation("");
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-4 p-6">
        <label className="media-label">
          اسم المستخدم
          <input
            autoFocus
            required
            maxLength={100}
            className="media-input mt-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="media-label">
          المسمى الوظيفي
          <input
            required
            maxLength={150}
            className="media-input mt-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="media-label">
          اسم تسجيل الدخول
          <input
            required
            readOnly={!!protectedAccount}
            dir="ltr"
            autoComplete="off"
            minLength={3}
            maxLength={64}
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}"
            className="media-input mt-2 text-start"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <p className="text-xs text-[var(--soft)]">
          {protectedAccount
            ? "يبقى اسم دخول هذا الحساب root ثابتًا."
            : "استخدم حروفًا إنجليزية وأرقامًا، ويمكن إضافة النقطة والشرطة. هذا هو الاسم الذي يستخدمه العضو للدخول."}
        </p>
        <label className="media-label">
          البريد الإلكتروني للإشعارات
          <input
            type="email"
            dir="ltr"
            autoComplete="off"
            maxLength={254}
            className="media-input mt-2 text-start"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <p className="text-xs text-[var(--soft)]">
          اختياري. تصل إليه إشعارات النظام بالبريد عند تفعيل الإرسال.
        </p>
        <label className="media-label">
          صيغة المخاطبة في الواجهة
          <select
            className="media-input mt-2"
            value={addressForm}
            onChange={(event) => setAddressForm(event.target.value === "f" ? "f" : "m")}
          >
            <option value="m">مذكر (ابدأ يومك)</option>
            <option value="f">مؤنث (ابدئي يومك)</option>
          </select>
        </label>
        {!protectedAccount && (
          <label className="media-label">
            صلاحية المستخدم
            <select
              className="media-input mt-2"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as Exclude<MemberRole, "superadmin">)
              }
            >
              {(["content", "designer", "manager", "admin"] as const).map(
                (value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        <label className="media-label">
          {member ? "كلمة مرور جديدة" : "كلمة المرور"}
          <input
            type="password"
            autoComplete="new-password"
            required={mustSetPassword}
            minLength={6}
            maxLength={256}
            dir="ltr"
            className="media-input mt-2 text-start"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="media-label">
          تأكيد كلمة المرور
          <input
            type="password"
            autoComplete="new-password"
            required={mustSetPassword || !!password}
            maxLength={256}
            dir="ltr"
            className="media-input mt-2 text-start"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {member && !mustSetPassword && (
          <p className="text-xs text-[var(--soft)]">
            اترك حقلي كلمة المرور فارغين للاحتفاظ بالكلمة الحالية.
          </p>
        )}
        {member && mustSetPassword && (
          <p className="text-xs text-[var(--soft)]">
            عيّن كلمة مرور لأول مرة حتى يتمكن هذا المستخدم من الدخول.
          </p>
        )}
        {member && !protectedAccount && (
          <label className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            السماح للمستخدم بالدخول وتنفيذ المهام
          </label>
        )}
        {protectedAccount && (
          <p className="text-xs text-[var(--soft)]">
            يبقى هذا الحساب نشطًا بصلاحياته الحالية.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-[#fff0f1] p-3 text-sm text-[var(--danger)]"
          >
            {error}
          </p>
        )}
        <ActionButton primary type="submit" disabled={busy}>
          {busy ? "جارٍ الحفظ…" : member ? "حفظ الحساب" : "إنشاء الحساب"}
        </ActionButton>
      </fieldset>
    </form>
  );
}

async function saveAddressForm(memberId: string, form: "m" | "f") {
  const response = await fetch("/api/engagement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setAddressForm", memberId, form }) });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error || "تعذر حفظ صيغة المخاطبة.");
  await useMediaStore.getState().refresh();
}

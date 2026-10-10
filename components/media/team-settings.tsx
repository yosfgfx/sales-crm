"use client";

import { useEffect, useState } from "react";
import {
  ROLE_LABELS,
  memberDisplayLabel,
  type AccountSummary,
  type MemberRole,
  type TeamMember,
} from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Icon, Modal, errorText } from "./ui";

export default function TeamSettings() {
  const store = useMediaStore();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const readAccounts = store.readAccounts;
  useEffect(() => {
    void readAccounts().catch((err) => setError(errorText(err)));
  }, [readAccounts]);
  const editingAccount = store.accounts.find(
    (account) => account.memberId === editing?.id,
  );
  const superuser = store.currentUser?.role === "superadmin";
  return (
    <>
      <section className="media-card space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2>حسابات الفريق والصلاحيات</h2>
            <p className="mt-2 max-w-[48em] text-[var(--soft)]">
              أضف مستخدمين ومديري نظام، وحدد أدوارهم وأسماء الدخول وكلمات المرور
              من هنا.
            </p>
          </div>
          <ActionButton
            onClick={() => setNewOpen(true)}
            disabled={!store.accountsLoaded}
          >
            <Icon name="people" className="size-4" />
            إضافة مستخدم
          </ActionButton>
        </div>
        {!store.accountsLoaded && !error && (
          <p role="status" className="text-sm text-[var(--soft)]">
            جارٍ تحميل حسابات الفريق…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-[#fff0f1] p-4 text-sm text-[var(--danger)]"
          >
            <p>{error}</p>
            <ActionButton
              className="mt-3"
              onClick={() => {
                setError("");
                void readAccounts().catch((err) => setError(errorText(err)));
              }}
            >
              إعادة المحاولة
            </ActionButton>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {store.data.members.map((member) => {
            const account = store.accounts.find(
              (item) => item.memberId === member.id,
            );
            const protectedAccount =
              member.role === "superadmin" || account?.protected;
            const canEdit =
              store.accountsLoaded && (!protectedAccount || superuser);
            return (
              <div
                key={member.id}
                className="rounded-xl border border-[var(--border)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--primary)]"
                    >
                      {member.initials}
                    </span>
                    <div className="min-w-0">
                      <span className="block font-bold break-words">
                        {member.name}
                      </span>
                      <span className="text-xs text-[var(--soft)]">
                        {memberDisplayLabel(member)} ·{" "}
                        {member.active ? "نشط" : "غير نشط"}
                      </span>
                    </div>
                  </div>
                  {canEdit && (
                    <ActionButton
                      aria-label={
                        "تعديل حساب " +
                        member.name +
                        " (" +
                        (account?.username || member.id) +
                        ")"
                      }
                      onClick={() => setEditing(member)}
                      className="size-10 shrink-0 px-0"
                    >
                      <Icon name="design" className="size-4" />
                    </ActionButton>
                  )}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[var(--soft)]">
                  {memberDisplayLabel(member) === "قسم التصميم والإنتاج" ||
                  member.role === "designer"
                    ? "يجدول الأعمال المعتمدة وينفذها ويسلّم النسخ النهائية ويؤرشفها."
                    : member.role === "superadmin"
                      ? "يتابع أعمال الفريق من الفكرة حتى التسليم والأرشفة."
                      : member.role === "admin"
                        ? "يدير الشركات والتصنيفات والإعدادات وحسابات الفريق وجميع مراحل العمل."
                        : member.role === "manager"
                          ? "يراجع الأفكار ويعتمدها أو يعيدها بملاحظات واضحة."
                          : member.role === "content"
                            ? "ينشئ الأفكار ويكتب المحتوى ويجمع العروض ويتابع ملاحظات المدير."
                            : "يجدول الأعمال المعتمدة وينفذها ويسلّم النسخ النهائية."}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--background)] p-3 text-xs">
                  <div>
                    <span className="block text-[var(--soft)]">
                      اسم تسجيل الدخول
                    </span>
                    <bdi className="mt-1 block font-medium break-all select-all">
                      {account?.username ||
                        (store.accountsLoaded ? member.id : "…")}
                    </bdi>
                  </div>
                  {store.accountsLoaded && (
                    <span
                      className={
                        "media-badge " +
                        (account?.hasPassword
                          ? "media-badge-success"
                          : "media-badge-warning")
                      }
                    >
                      {account?.hasPassword
                        ? "كلمة المرور مفعّلة"
                        : "بانتظار تعيين كلمة مرور"}
                    </span>
                  )}
                </div>
                {protectedAccount && (
                  <p className="mt-3 text-xs text-[var(--soft)]">
                    هذا الحساب محمي من التعديل بواسطة المستخدمين الآخرين.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="rounded-xl bg-[var(--background)] p-4 text-sm text-[var(--soft)]">
          يمكن تعيين كلمة مرور جديدة أو تغيير اسم الدخول والدور من زر تعديل
          الحساب. عند تغيير بيانات الدخول، تنتهي جلسات الحساب ليُسجل الدخول
          ببياناته الجديدة.
        </p>
        {message && (
          <p role="status" className="rounded-lg bg-[var(--accent)] p-3">
            {message}
          </p>
        )}
      </section>
      <Modal
        open={newOpen || !!editing}
        onClose={() => {
          setNewOpen(false);
          setEditing(null);
        }}
        title={editing ? "تعديل حساب المستخدم" : "إضافة مستخدم"}
        description={
          editing
            ? "عدّل بيانات الحساب أو عيّن كلمة مرور جديدة. لا تُعرض كلمات المرور الحالية."
            : "حدد بيانات المستخدم ودوره واسم دخوله وكلمة المرور."
        }
      >
        {(newOpen || editing) && (
          <MemberForm
            key={editing?.id || "new"}
            member={editing || undefined}
            account={editingAccount}
            onDone={(text) => {
              setMessage(text);
              setNewOpen(false);
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function MemberForm({
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

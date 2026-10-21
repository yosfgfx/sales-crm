"use client";

import { useEffect, useState } from "react";
import { isFormerMember, memberDisplayLabel, type TeamMember } from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Icon, Modal, errorText } from "./ui";
import { MemberForm } from "./team-settings/member-form";
import { RemoveMemberDialog } from "./team-settings/remove-member";

export default function TeamSettings() {
  const store = useMediaStore();
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
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
          {store.data.members.filter((member) => !isFormerMember(member)).map((member) => {
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
                    <div className="flex shrink-0 gap-2">
                    {!protectedAccount && member.id !== store.currentUser?.id && (
                      <ActionButton
                        aria-label={"حذف حساب " + member.name + " نهائياً"}
                        onClick={() => setRemoving(member)}
                        className="size-10 shrink-0 px-0 !text-[var(--danger)]"
                      >
                        <Icon name="trash" className="size-4" />
                      </ActionButton>
                    )}
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
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[var(--soft)]">
                  {member.role === "designer"
                    ? "يجدول الأعمال المعتمدة وينفذها ويسلّم النسخ النهائية، ثم يؤرشفها النظام تلقائياً."
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
      <RemoveMemberDialog
        member={removing}
        onClose={() => setRemoving(null)}
        onDone={(text) => {
          setMessage(text);
          setRemoving(null);
        }}
      />
    </>
  );
}

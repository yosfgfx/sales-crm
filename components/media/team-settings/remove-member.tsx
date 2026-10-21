"use client";

import { useEffect, useState } from "react";
import { memberDisplayLabel, type TeamMember } from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Modal, errorText } from "../ui";

type Plan = { openOwned: number; openDesigned: number; meetingTasks: number; upcomingMeetings: number };

export function RemoveMemberDialog({ member, onClose, onDone }: { member: TeamMember | null; onClose: () => void; onDone: (message: string) => void }) {
  const store = useMediaStore();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [owner, setOwner] = useState("");
  const [designer, setDesigner] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    void useMediaStore.getState().planMemberRemoval(member.id).then((result) => !cancelled && setPlan(result), (cause) => !cancelled && setError(errorText(cause)));
    return () => {
      cancelled = true;
    };
  }, [member]);
  const candidates = store.data.members.filter((item) => item.active && item.id !== member?.id && item.role !== "superadmin");
  const owners = candidates.filter((item) => (plan?.openOwned ? ["content", "admin"].includes(item.role) : true));
  const designers = candidates.filter((item) => item.role === "designer");
  const needsOwner = !!plan && plan.openOwned + plan.meetingTasks + plan.upcomingMeetings > 0;
  const needsDesigner = !!plan && plan.openDesigned > 0;
  const ready = !!plan && (!needsOwner || owner) && (!needsDesigner || designer) && confirm.trim() === member?.name.trim();
  return (
    <Modal open={!!member} onClose={onClose} locked={busy} title={`حذف ${member?.name || "العضو"} نهائياً`} description="يُحذف الحساب وبياناته الشخصية، وتنتقل أعماله المفتوحة إلى البديل الذي تختاره.">
      {member && (
        <form
          className="space-y-4 p-6"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!ready) return;
            setBusy(true);
            setError("");
            try {
              const removed = await store.removeMember({ memberId: member.id, ownerReplacementId: owner || undefined, designerReplacementId: designer || undefined, confirmName: confirm.trim() });
              onDone(`حُذف حساب ${removed.name} نهائياً${removed.reassigned ? `، وأُسند ${removed.reassigned.toLocaleString("ar-SA")} من أعماله إلى البديل وأُبلغ بذلك` : ""}.`);
            } catch (cause) {
              setError(errorText(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="rounded-xl bg-[#fff0f1] p-4 text-sm leading-relaxed text-[#8f1f33]">
            <strong className="block">لا يمكن التراجع عن هذا الإجراء.</strong>
            يُحذف حساب الدخول والجلسات ومفاتيح API والمهام الشخصية والإشعارات وبيانات الحضور. يبقى سجل الأعمال السابقة كما هو، ويظهر فيه باسم «عضو سابق».
          </div>
          {!plan && !error && <p role="status" className="text-sm text-[var(--soft)]">جارٍ حساب الأعمال المرتبطة بالعضو…</p>}
          {plan && (
            <ul className="space-y-1.5 rounded-xl bg-[var(--background)] p-4 text-sm">
              <li>أفكار مفتوحة هو مسؤولها: <b>{plan.openOwned.toLocaleString("ar-SA")}</b></li>
              <li>أعمال تصميم مفتوحة مسندة إليه: <b>{plan.openDesigned.toLocaleString("ar-SA")}</b></li>
              <li>مهام اجتماعات لم تُنجز: <b>{plan.meetingTasks.toLocaleString("ar-SA")}</b></li>
              <li>اجتماعات قادمة ينظمها: <b>{plan.upcomingMeetings.toLocaleString("ar-SA")}</b></li>
            </ul>
          )}
          {needsOwner && (
            <label className="media-label">
              {plan!.openOwned ? "مسؤول المحتوى البديل" : "العضو البديل"}
              <select required className="media-input mt-2" value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="">اختر البديل</option>
                {owners.map((item) => <option key={item.id} value={item.id}>{item.name} · {memberDisplayLabel(item)}</option>)}
              </select>
            </label>
          )}
          {needsDesigner && (
            <label className="media-label">
              المصمم البديل
              <select required className="media-input mt-2" value={designer} onChange={(event) => setDesigner(event.target.value)}>
                <option value="">اختر المصمم</option>
                {designers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {!designers.length && <span className="mt-1 block text-xs text-[var(--danger)]">لا يوجد مصمم فعال آخر. أضف مصمماً أولاً أو أعد إسناد أعماله يدوياً.</span>}
            </label>
          )}
          {plan && !needsOwner && !needsDesigner && <p className="text-sm text-[var(--soft)]">لا توجد أعمال مفتوحة تحتاج إعادة إسناد.</p>}
          <label className="media-label">
            للتأكيد اكتب اسم العضو: <bdi className="font-bold">{member.name}</bdi>
            <input className="media-input mt-2" autoComplete="off" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={onClose} disabled={busy}>إلغاء</ActionButton>
            <ActionButton type="submit" disabled={!ready || busy} className="!bg-[var(--danger)] !text-white !shadow-none">
              {busy ? "جارٍ الحذف…" : "حذف نهائي وإعادة الإسناد"}
            </ActionButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

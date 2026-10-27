"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Idea, TeamMember } from "@/data/media";
import type { MediaState } from "@/stores/media-store";
import {
  canCancelIdea,
  canDeleteIdea,
  canReopenIdea,
  canWithdrawIdea,
} from "@/lib/media-workflow";
import { ActionButton, Icon, formatDate } from "../ui";
import type { LifecycleDraft } from "./constants";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function ActionsBar({
  idea,
  currentUser,
  admin,
  busy,
  run,
  store,
  canEdit,
  canReview,
  canDesign,
  setLifecycle,
  setReassign,
  setReturnDialog,
}: {
  idea: Idea;
  currentUser: TeamMember | null;
  admin: boolean;
  busy: boolean;
  run: Run;
  store: MediaState;
  canEdit: boolean;
  canReview: boolean;
  canDesign: boolean;
  setLifecycle: Setter<LifecycleDraft | null>;
  setReassign: Setter<{ ownerId: string; designerId: string } | null>;
  setReturnDialog: Setter<boolean>;
}) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white px-5 py-4">
      <span className="text-xs text-[var(--soft)]">
        آخر تحديث: {formatDate(idea.updatedAt)}
      </span>
      <div className="flex flex-wrap gap-3">
        {canDeleteIdea(idea, currentUser) && (
          <ActionButton
            className="!text-[var(--danger)]"
            disabled={busy}
            onClick={() => setLifecycle({ kind: "delete", text: "" })}
          >
            حذف الفكرة
          </ActionButton>
        )}
        {canCancelIdea(idea, currentUser) && (
          <ActionButton
            disabled={busy}
            onClick={() => setLifecycle({ kind: "cancel", text: "" })}
          >
            إلغاء الفكرة
          </ActionButton>
        )}
        {canReopenIdea(idea, currentUser) && (
          <ActionButton
            disabled={busy}
            onClick={() => setLifecycle({ kind: "reopen", text: "" })}
          >
            إعادة فتح
          </ActionButton>
        )}
        {admin &&
          !["delivered", "cancelled", "rejected"].includes(idea.status) && (
            <ActionButton
              disabled={busy}
              onClick={() =>
                setReassign({
                  ownerId: idea.ownerId,
                  designerId: idea.designerId,
                })
              }
            >
              إعادة الإسناد
            </ActionButton>
          )}
        {canWithdrawIdea(idea, currentUser) && (
          <ActionButton
            disabled={busy}
            onClick={() =>
              void run(
                () => store.withdrawIdea(idea.id),
                "سُحبت الفكرة من الاعتماد. عدّلها ثم أعد إرسالها.",
              )
            }
          >
            سحب من الاعتماد
          </ActionButton>
        )}
        {(admin || currentUser?.role === "manager") &&
          idea.status === "review" &&
          idea.ownerId === currentUser?.id && (
            <span className="text-xs text-[var(--soft)]">
              يعتمد هذه الفكرة مدير آخر لأنك صاحبها.
            </span>
          )}
        {canEdit &&
          ["draft", "quotations", "changes"].includes(idea.status) && (
            <ActionButton
              primary
              disabled={busy}
              onClick={() =>
                void run(
                  () => store.submitIdea(idea.id),
                  "أُرسلت الفكرة مع عرضها إلى المدير للمراجعة.",
                )
              }
            >
              <Icon name="check" className="size-4" />
              {idea.status === "changes"
                ? "إعادة الإرسال للاعتماد"
                : "إرسال للاعتماد"}
            </ActionButton>
          )}
        {canReview && (
          <>
            <ActionButton
              className="!text-[var(--danger)]"
              onClick={() => setLifecycle({ kind: "reject", text: "" })}
              disabled={busy}
            >
              رفض نهائي
            </ActionButton>
            <ActionButton onClick={() => setReturnDialog(true)} disabled={busy}>
              إعادة للتعديل
            </ActionButton>
            <ActionButton
              primary
              disabled={busy}
              onClick={() =>
                void run(
                  () => store.reviewIdea(idea.id, "approved", ""),
                  "اعتُمدت الفكرة وانتقلت تلقائيًا إلى استوديو التصميم.",
                )
              }
            >
              <Icon name="check" className="size-4" />
              اعتماد الفكرة
            </ActionButton>
          </>
        )}
        {canDesign && idea.status === "scheduled" && (
          <ActionButton
            primary
            disabled={busy}
            onClick={() =>
              void run(
                () => store.changeDesignStatus(idea.id, "designing"),
                "بدأ تنفيذ التصميم.",
              )
            }
          >
            بدء التصميم
          </ActionButton>
        )}
        {canDesign && (idea.status === "designing" || idea.status === "design_review") && (
          <>
            <ActionButton
              primary
              disabled={busy}
              onClick={() =>
                void run(
                  () => store.changeDesignStatus(idea.id, "delivered"),
                  "تم التسليم وأُضيف العمل إلى التقرير الشهري. ستتم أرشفته في Google Drive تلقائياً.",
                )
              }
            >
              <Icon name="archive" className="size-4" />
              تسجيل التسليم النهائي
            </ActionButton>
          </>
        )}
        {idea.status === "delivered" && (
          <span className="media-badge media-badge-success">
            سُلّم · يظهر في تقرير{" "}
            {formatDate(idea.deliveredAt, {
              month: "long",
              year: "numeric",
              day: undefined,
            })}
          </span>
        )}
      </div>
    </div>
  );
}

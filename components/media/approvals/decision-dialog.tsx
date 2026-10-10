"use client";

import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react";
import type { Idea } from "@/data/media";
import { ActionButton, countText, Modal, StatusBadge, formatDate } from "../ui";

export function DecisionDialog({
  decision,
  selected,
  closeDecision,
  saveDecision,
  feedbackField,
  feedback,
  setFeedback,
  error,
  busy,
  saving,
  canReview,
}: {
  decision: { ideaId: string; value: "approved" | "changes" | "rejected"; updatedAt: string } | null;
  selected: Idea | undefined;
  closeDecision: () => void;
  saveDecision: (event: FormEvent) => Promise<void>;
  feedbackField: RefObject<HTMLTextAreaElement | null>;
  feedback: string;
  setFeedback: Dispatch<SetStateAction<string>>;
  error: string;
  busy: boolean;
  saving: boolean;
  canReview: boolean;
}) {
  return (
    <Modal
      open={!!decision}
      onClose={closeDecision}
      locked={busy}
      title={
        decision?.value === "changes"
          ? "إعادة الفكرة للتعديل"
          : decision?.value === "rejected"
            ? "رفض الفكرة نهائياً"
            : "اعتماد الفكرة"
      }
      description={selected?.title || "تأكيد قرار مراجعة الفكرة"}
      wide
    >
      <form
        onSubmit={(event) => void saveDecision(event)}
        className="space-y-5 p-5 sm:p-6"
      >
        {selected && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={selected.status} />
              <span className="text-xs text-[var(--soft)]">
                موعد التسليم: {formatDate(selected.dueDate)}
              </span>
            </div>
            <h3 className="mt-3 font-semibold">{selected.title}</h3>
            <div className="mt-3 max-h-44 overflow-y-auto text-sm leading-7 whitespace-pre-wrap text-[var(--soft)]">
              {selected.description}
            </div>
            <p className="mt-3 text-xs text-[var(--soft)]">
              {countText(selected.attachments.length, "attachment")} ·{" "}
              {countText(selected.quotations.length, "quote")} ·{" "}
              {countText(selected.channels.length, "channel")}
            </p>
          </div>
        )}
        <p className="text-sm text-[var(--soft)]">
          {decision?.value === "approved"
            ? "اعتماد هذه الفكرة يسجل قرارك ويُشعر فريق التصميم لبدء الجدولة. راجع النص والخطة والعرض والمرفقات قبل التأكيد."
            : decision?.value === "rejected"
              ? "تُغلق الفكرة ولا تعود للتعديل، ويصل سبب الرفض إلى صاحبها. يستطيع مدير النظام إعادة فتحها لاحقاً."
              : "تظهر ملاحظاتك بوضوح في الفكرة وتصل إلى مسؤول المحتوى. تبقى الفكرة بحاجة إلى تعديل وإعادة إرسال للاعتماد."}
        </p>
        <label className="media-label">
          {decision?.value === "changes"
            ? "ما المطلوب تعديله؟"
            : decision?.value === "rejected"
              ? "سبب الرفض"
              : "ملاحظات الاعتماد (اختياري)"}
          <textarea
            ref={feedbackField}
            required={decision?.value !== "approved"}
            maxLength={20000}
            rows={4}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            disabled={busy}
            className="media-input mt-2 resize-y"
            placeholder={
              decision?.value === "changes"
                ? "حدّد النص أو الخطة أو العرض الذي يحتاج تعديلاً، وما المتوقع من الفريق."
                : "أي توجيه يحتاجه فريق المحتوى أو التصميم بعد الاعتماد."
            }
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton onClick={closeDecision} disabled={busy}>
            إلغاء
          </ActionButton>
          <ActionButton
            primary
            type="submit"
            disabled={
              busy ||
              saving ||
              !canReview ||
              !selected ||
              selected.status !== "review"
            }
          >
            {busy
              ? "جارٍ حفظ القرار…"
              : decision?.value === "changes"
                ? "إرسال الملاحظات وإعادة الفكرة"
                : decision?.value === "rejected"
                  ? "تأكيد الرفض"
                  : "تأكيد الاعتماد"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}

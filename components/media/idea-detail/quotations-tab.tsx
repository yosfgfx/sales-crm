"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Idea } from "@/data/media";
import type { MediaState } from "@/stores/media-store";
import { ActionButton, Icon } from "../ui";

type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function QuotationsTab({
  idea,
  canEdit,
  setQuoteOpen,
  run,
  store,
}: {
  idea: Idea;
  canEdit: boolean;
  setQuoteOpen: Dispatch<SetStateAction<boolean>>;
  run: Run;
  store: MediaState;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[var(--soft)]">
          {idea.needsQuotes
            ? "العروض ومرفقاتها جزء من عرض الاعتماد."
            : "هذه الفكرة مُعدّة للتنفيذ الداخلي."}
        </p>
        {canEdit && (
          <ActionButton onClick={() => setQuoteOpen(true)}>
            <Icon name="plus" className="size-4" />
            إضافة عرض سعر
          </ActionButton>
        )}
      </div>
      {idea.quotations.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--input)] p-8 text-center text-sm text-[var(--soft)]">
          {idea.needsQuotes
            ? "أرفق عرض سعر واحدًا على الأقل قبل إرسال الفكرة للاعتماد."
            : "لا توجد عروض أسعار مرفقة."}
        </div>
      )}
      {idea.quotations.map((q) => {
        const file = idea.attachments.find(
          (a) => a.id === q.attachmentId,
        );
        return (
          <div
            key={q.id}
            className={`rounded-xl border p-5 ${q.recommended ? "border-[#c0b4e8] bg-[#f7f5ff]" : "border-[var(--border)]"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="!text-base">{q.vendor}</h2>
              {q.recommended && (
                <span className="media-badge media-badge-accent">
                  العرض الموصى به
                </span>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-[var(--soft)]">
              {q.scope}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xl font-bold tabular-nums">
                {q.amount.toLocaleString("ar-SA")}{" "}
                <span className="text-xs font-normal text-[var(--soft)]">
                  ر.س.
                </span>
              </span>
              <span className="text-sm text-[var(--soft)]">
                مدة التنفيذ: {q.days} أيام
              </span>
            </div>
            {file && (
              <a
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs underline decoration-[#b4accc] underline-offset-4"
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="file" className="size-4" />
                <bdi>{file.name}</bdi>
                <Icon name="download" className="size-3.5" />
              </a>
            )}
            {canEdit && (
              <ActionButton
                onClick={() => {
                  if (
                    window.confirm(
                      "حذف عرض السعر من الفكرة؟ يبقى سجل العملية محفوظًا.",
                    )
                  )
                    void run(
                      () => store.removeQuotation(idea.id, q.id),
                      "حُذف عرض السعر.",
                    );
                }}
                className="mt-3 !text-[var(--danger)]"
              >
                حذف عرض السعر
              </ActionButton>
            )}
          </div>
        );
      })}
    </div>
  );
}

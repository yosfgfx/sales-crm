"use client";

import { WORK_TYPE_LABELS, type Idea, type MediaData, STATUS_HINTS } from "@/data/media";
import { IdeaCompanies } from "../company-logo";
import { ActionButton, Icon, PriorityBadge, StatusBadge } from "../ui";

export function IdeaSummary({
  idea,
  data,
  canEdit,
  onEdit,
}: {
  idea: Idea;
  data: MediaData;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <>
      <IdeaCompanies idea={idea} companies={data.companies} logoClassName="h-12 w-40" className="text-sm text-[var(--soft)]" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={idea.status} />
          <PriorityBadge priority={idea.priority} />
          <span className="rounded-lg bg-[var(--background)] px-2 py-1 text-xs text-[var(--soft)]">
            {WORK_TYPE_LABELS[idea.workType]}
          </span>
        </div>
        {canEdit && (
          <ActionButton onClick={onEdit}>
            <Icon name="design" className="size-4" />
            تعديل الفكرة
          </ActionButton>
        )}
      </div>
      <p className="text-sm text-[var(--soft)]">{STATUS_HINTS[idea.status]}</p>
      {idea.sourceProposal && (
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
          <h2 className="!text-base">إسناد المقترح</h2>
          <p className="text-sm">
            <strong>مقدم الفكرة: {idea.sourceProposal.proposerName}</strong>
          </p>
          <p className="text-xs text-[var(--soft)]">
            حُفظت الفكرة من قائمة المقترحات المرفقة. مسؤول التنسيق قابل
            للتغيير، ويبقى إسناد الفكرة إلى صاحبها محفوظًا.
          </p>
          {idea.sourceProposal.funding && (
            <p className="text-xs text-[var(--soft)]">
              نوع التنفيذ في المصدر: {idea.sourceProposal.funding}
            </p>
          )}
          {idea.sourceProposal.sourceApproval && (
            <p className="text-xs text-[var(--soft)]">
              حالة الفكرة في الملف المرفق:{" "}
              {idea.sourceProposal.sourceApproval}. الاعتماد داخل النظام
              يظهر في حالة العمل وسجل المدير.
            </p>
          )}
          {idea.sourceProposal.reviewNote && (
            <p className="rounded-lg bg-[#fff1dc] p-3 text-sm text-[var(--warning)]">
              {idea.sourceProposal.reviewNote}
            </p>
          )}
          <details className="text-sm">
            <summary className="min-h-10 cursor-pointer py-2 font-medium text-[var(--primary)]">
              النص الأصلي للمقترح
            </summary>
            <div className="space-y-3 pt-2">
              <p className="whitespace-pre-wrap">
                {idea.sourceProposal.originalGoal}
              </p>
              <p className="whitespace-pre-wrap">
                {idea.sourceProposal.originalConcept}
              </p>
            </div>
          </details>
        </section>
      )}
      {idea.managerFeedback && (
        <div className="rounded-xl border border-[#efd4a5] bg-[#fff5e5] p-4">
          <div className="flex items-center gap-2 font-bold text-[var(--warning)]">
            <Icon name="ideas" className="size-4" />
            ملاحظة المدير {idea.status === "changes" && "· تحتاج إجراء"}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[var(--warning)]">
            {idea.managerFeedback}
          </p>
          {idea.status === "changes" && (
            <span className="mt-2 block text-xs text-[var(--warning)]">
              عدّل الفكرة ثم أرسلها للمراجعة مجددًا. تبقى هذه الملاحظة
              محفوظة في سجل العمل.
            </span>
          )}
        </div>
      )}
      {["draft", "quotations", "review", "changes"].includes(
        idea.status,
      ) && (
        <div className="flex items-start gap-2 rounded-xl bg-[var(--background)] p-3 text-xs text-[var(--soft)]">
          <Icon name="clock" className="mt-0.5 size-4" />
          <span>
            لم تُعتمد هذه الفكرة بعد. تنتقل إلى التصميم تلقائيًا عند اعتماد
            المدير.
          </span>
        </div>
      )}
    </>
  );
}

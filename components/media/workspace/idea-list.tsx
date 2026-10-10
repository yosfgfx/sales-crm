"use client";

import { WORK_TYPE_LABELS, type Idea, type MediaData } from "@/data/media";
import { CompanyLogo } from "../company-logo";
import { ActionButton, EmptyState, StatusBadge, formatDate } from "../ui";
import { companyOf, nameOf, production } from "./shared";

export function IdeaList({
  ideas,
  data,
  onOpen,
}: {
  ideas: Idea[];
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  if (!ideas.length)
    return (
      <EmptyState
        title="لا توجد أعمال مطابقة"
        description="جرّب تغيير البحث أو عوامل التصفية لإظهار المزيد من الأعمال."
      />
    );
  return (
    <div className="media-card overflow-hidden">
      <div className="hidden grid-cols-[1.7fr_1fr_1fr_.8fr_.7fr] gap-4 border-b border-[var(--border)] bg-[var(--background)] px-6 py-3 text-xs text-[var(--soft)] md:grid">
        <span>العمل</span>
        <span>الشركة والإدارة</span>
        <span>الحالة</span>
        <span>المسؤول</span>
        <span>موعد التسليم</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {ideas.map((idea) => (
          <ActionButton
            key={idea.id}
            onClick={() => onOpen(idea.id)}
            className="grid h-auto w-full grid-cols-1 items-center gap-3 !rounded-none px-6 py-5 text-start !whitespace-normal !shadow-none md:grid-cols-[1.7fr_1fr_1fr_.8fr_.7fr]"
          >
            <span>
              <span className="block text-xs text-[var(--soft)]">
                <bdi>{idea.code}</bdi> · {WORK_TYPE_LABELS[idea.workType]}
              </span>
              <span className="mt-1 block leading-relaxed font-bold">
                {idea.title}
              </span>
              {idea.sourceProposal && (
                <span className="mt-1 block text-xs text-[var(--primary)]">
                  مقدم الفكرة: {idea.sourceProposal.proposerName}
                </span>
              )}
            </span>
            <span className="text-xs leading-relaxed text-[var(--soft)]">
              <CompanyLogo
                companyId={idea.companyId}
                decorative
                className="mb-1 h-8 w-24 p-1"
              />
              <span className="block">{companyOf(data, idea.companyId)}</span>
              <span className="block">{idea.department}</span>
            </span>
            <span>
              <StatusBadge status={idea.status} />
            </span>
            <span className="text-xs text-[var(--soft)]">
              {nameOf(
                data,
                production.includes(idea.status)
                  ? idea.designerId
                  : idea.ownerId,
              )}
            </span>
            <span className="text-xs text-[var(--soft)]">
              {formatDate(
                idea.status === "delivered" ? idea.deliveredAt : idea.dueDate,
              )}
            </span>
          </ActionButton>
        ))}
      </div>
    </div>
  );
}

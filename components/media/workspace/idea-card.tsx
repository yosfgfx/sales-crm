"use client";

import { WORK_TYPE_LABELS, type Idea, type MediaData } from "@/data/media";
import { CompanyLogo } from "../company-logo";
import {
  ActionButton,
  Channels,
  Icon,
  PriorityBadge,
  formatDate,
  today,
} from "../ui";
import { companyOf, nameOf, production } from "./shared";

export function IdeaCard({
  idea,
  data,
  onOpen,
}: {
  idea: Idea;
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  const late = idea.dueDate < today() && !["delivered", "cancelled", "rejected", "draft"].includes(idea.status);
  return (
    <ActionButton
      onClick={() => onOpen(idea.id)}
      className="media-card !block h-auto w-full !rounded-xl !p-4 text-start !whitespace-normal !shadow-[0_1px_2px_#20273c05,0_0_0_1px_#e5e7ef] hover:!shadow-[0_5px_14px_#20273c0a,0_0_0_1px_#c9c2ed]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--soft)]">
          <bdi>{idea.code}</bdi>
        </span>
        <PriorityBadge priority={idea.priority} />
      </div>
      <span className="block text-sm leading-relaxed font-bold">
        {idea.title}
      </span>
      {idea.sourceProposal && (
        <span className="mt-2 block text-xs font-medium text-[var(--primary)]">
          مقدم الفكرة: {idea.sourceProposal.proposerName}
        </span>
      )}
      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-[var(--soft)]">
        <CompanyLogo
          companyId={idea.companyId}
          decorative
          className="h-8 w-24 p-1"
        />
        <span className="min-w-0">{companyOf(data, idea.companyId)}</span>
      </span>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-md bg-[var(--background)] px-2 py-1 text-xs text-[var(--soft)]">
          {WORK_TYPE_LABELS[idea.workType]}
        </span>
        <span className="rounded-md bg-[var(--background)] px-2 py-1 text-xs text-[var(--soft)]">
          {data.categories.find((c) => c.id === idea.categoryId)?.name}
        </span>
      </div>
      {idea.managerFeedback && idea.status === "changes" && (
        <span className="mt-3 block rounded-md bg-[#fff1dc] px-2 py-1.5 text-xs leading-relaxed text-[var(--warning)]">
          ملاحظة المدير: {idea.managerFeedback}
        </span>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <span className="flex items-center gap-1.5 text-xs text-[var(--soft)]">
          <span className="flex size-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs text-[var(--primary)]">
            {(production.includes(idea.status) ? idea.designerId : idea.ownerId) ? (
              nameOf(data, production.includes(idea.status) ? idea.designerId : idea.ownerId)[0]
            ) : (
              <Icon name="people" className="size-3.5" />
            )}
          </span>
          {
            nameOf(
              data,
              production.includes(idea.status) ? idea.designerId : idea.ownerId,
            ).split(" ")[0]
          }
        </span>
        <span
          className={`flex items-center gap-1 text-xs ${late ? "text-[var(--danger)]" : "text-[var(--soft)]"}`}
        >
          <Icon name="calendar" className="size-3.5" />
          {formatDate(idea.dueDate)}
          {late && " · متأخر"}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Channels channels={idea.channels} />
        <span className="flex items-center gap-1 text-xs text-[var(--soft)]">
          <Icon name="file" className="size-3" />
          {idea.attachments.length}
        </span>
      </div>
    </ActionButton>
  );
}

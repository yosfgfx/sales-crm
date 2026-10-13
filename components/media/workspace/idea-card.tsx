"use client";

import { WORK_TYPE_LABELS, type Idea, type MediaData } from "@/data/media";
import { IdeaCompanies } from "../company-logo";
import {
  ActionButton,
  Channels,
  Icon,
  PriorityBadge,
  formatDate,
  today,
} from "../ui";
import { nameOf, production } from "./shared";
import { useTeamPresence } from "@/stores/team-presence";

export function IdeaCard({
  idea,
  data,
  onOpen,
}: {
  idea: Idea;
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  const celebrated = useTeamPresence((state) =>
    Boolean(state.completed[idea.id]),
  );
  const delivered = idea.status === "delivered";
  const responsibleId =
    production.includes(idea.status) || delivered
      ? idea.designerId || idea.ownerId
      : idea.ownerId;
  const late =
    idea.dueDate < today() &&
    !["delivered", "cancelled", "rejected", "draft"].includes(idea.status);
  return (
    <ActionButton
      onClick={() => onOpen(idea.id)}
      className={`media-card !block h-auto w-full !rounded-xl !p-4 text-start !whitespace-normal ${delivered ? "!bg-[#eff9f3] !shadow-[0_1px_2px_#19725405,0_0_0_1px_#b9decd] hover:!shadow-[0_5px_14px_#1972540a,0_0_0_1px_#89c9ae]" : "!shadow-[0_1px_2px_#20273c05,0_0_0_1px_#e5e7ef] hover:!shadow-[0_5px_14px_#20273c0a,0_0_0_1px_#c9c2ed]"} ${celebrated ? "media-completion-new" : ""}`}
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
      {delivered && (
        <span className="media-badge media-badge-success mt-2">
          <Icon name="trophy" className="size-3.5" />
          إنجاز مكتمل · أحسنتم
        </span>
      )}
      {idea.sourceProposal && (
        <span className="mt-2 block text-xs font-medium text-[var(--primary)]">
          مقدم الفكرة: {idea.sourceProposal.proposerName}
        </span>
      )}
      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-[var(--soft)]">
        <IdeaCompanies idea={idea} companies={data.companies} />
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
            {responsibleId ? (
              nameOf(data, responsibleId)[0]
            ) : (
              <Icon name="people" className="size-3.5" />
            )}
          </span>
          {nameOf(data, responsibleId).split(" ")[0]}
        </span>
        <span
          className={`flex items-center gap-1 text-xs ${late ? "text-[var(--danger)]" : "text-[var(--soft)]"}`}
        >
          <Icon name="calendar" className="size-3.5" />
          {formatDate(delivered ? idea.deliveredAt : idea.dueDate)}
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

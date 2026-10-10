"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Idea, MediaData } from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { isAdministrator } from "@/lib/media-workflow";
import { CompanyLogo } from "./company-logo";
import {
  ActionButton,
  countText,
  TabList,
  Channels,
  EmptyState,
  Icon,
  PriorityBadge,
  StatusBadge,
  errorText,
} from "./ui";
import { DecisionDialog } from "./approvals/decision-dialog";

type Decision = "approved" | "changes" | "rejected";
type Props = {
  data: MediaData;
  onOpen: (id: string) => void;
  onNotice?: (message: string) => void;
  administration?: boolean;
};
const approvedStages = [
  "approved",
  "scheduled",
  "designing",
  "design_review",
  "delivered",
];

/** One approval view shared by the manager workspace and system administration. */
export default function Approvals({
  data,
  onOpen,
  onNotice,
  administration,
}: Props) {
  const currentUser = useMediaStore((store) => store.currentUser);
  const saving = useMediaStore((store) => store.saving);
  const [tab, setTab] = useState("review");
  const [decision, setDecision] = useState<{
    ideaId: string;
    value: Decision;
    updatedAt: string;
  } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const feedbackField = useRef<HTMLTextAreaElement>(null);
  const canReview =
    !!currentUser?.active &&
    (isAdministrator(currentUser) || currentUser.role === "manager");
  const managers = data.members.filter(
    (member) => member.active && member.role === "manager",
  );
  const ideas = data.ideas.filter((idea) =>
    tab === "review"
      ? idea.status === "review"
      : tab === "changes"
        ? idea.status === "changes"
        : approvedStages.includes(idea.status),
  );
  const selected = data.ideas.find((idea) => idea.id === decision?.ideaId);

  function startDecision(idea: Idea, value: Decision) {
    setFeedback("");
    setError("");
    setNotice("");
    setDecision({ ideaId: idea.id, value, updatedAt: idea.updatedAt });
  }

  function closeDecision() {
    if (!busy) {
      setDecision(null);
      setError("");
    }
  }

  async function saveDecision(event: FormEvent) {
    event.preventDefault();
    if (!decision || busy || saving) return;
    setError("");
    if (decision.value !== "approved" && !feedback.trim()) {
      setError(decision.value === "rejected" ? "اكتب سبب الرفض ليصل إلى صاحب الفكرة." : "اكتب ملاحظات واضحة لفريق المحتوى قبل إعادة الفكرة للتعديل.");
      feedbackField.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const latest = useMediaStore.getState();
      const actor = latest.currentUser;
      const idea = latest.data.ideas.find(
        (item) => item.id === decision.ideaId,
      );
      if (
        !actor?.active ||
        (!isAdministrator(actor) && actor.role !== "manager")
      )
        throw new Error(
          "اعتماد الأفكار متاح لمدير الإدارة أو مدير النظام فقط.",
        );
      if (
        !idea ||
        idea.status !== "review" ||
        idea.updatedAt !== decision.updatedAt
      )
        throw new Error(
          "تغيرت الفكرة منذ فتحها. أغلق هذه النافذة وراجع تفاصيلها المحدثة قبل اتخاذ القرار.",
        );
      await latest.reviewIdea(idea.id, decision.value, feedback);
      const message =
        decision.value === "approved"
          ? "اعتُمدت الفكرة وأُحيلت تلقائياً إلى فريق التصميم للجدولة."
          : decision.value === "rejected"
            ? "رُفضت الفكرة نهائياً وأُشعر صاحبها بالسبب."
            : "أُعيدت الفكرة للتعديل مع ملاحظاتك، وأُشعر مسؤول المحتوى للمتابعة.";
      setDecision(null);
      setFeedback("");
      if (onNotice) onNotice(message);
      else setNotice(message);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      {administration && (
        <div className="media-card flex items-start gap-3 p-5">
          <span className="rounded-xl bg-[var(--accent)] p-2.5 text-[var(--primary)]">
            <Icon name="check" />
          </span>
          <div className="min-w-0">
            <h2 className="!text-lg">اعتمادات الأفكار</h2>
            <p className="mt-1 text-sm text-[var(--soft)]">
              راجع الفكرة والنص والمرفقات وعروض الأسعار، ثم اعتمدها أو أعدها إلى
              المحتوى بملاحظات واضحة. الاعتماد يحيلها إلى فريق التصميم تلقائياً.
            </p>
            <p className="mt-3 text-sm font-medium">
              مسؤولو الاعتماد:{" "}
              {managers.length
                ? managers.map((manager) => manager.name).join("، ")
                : "لم يُحدد مدير إدارة فعال"}
            </p>
            <p className="mt-1 text-xs text-[var(--soft)]">
              يمكن لمدير النظام مراجعة الأفكار واعتمادها من هنا أيضاً.
            </p>
          </div>
        </div>
      )}
      <TabList
        label="تصفية الأفكار حسب الاعتماد"
        idPrefix="approvals"
        value={tab}
        onChange={(id) => { setTab(id); setNotice(""); }}
        items={[
          {
            id: "review",
            label: "بانتظار المراجعة",
            count: data.ideas.filter((idea) => idea.status === "review").length,
          },
          {
            id: "changes",
            label: "أعيدت للتعديل",
            count: data.ideas.filter((idea) => idea.status === "changes")
              .length,
          },
          {
            id: "approved",
            label: "تم اعتمادها",
            count: data.ideas.filter((idea) =>
              approvedStages.includes(idea.status),
            ).length,
          },
        ].map((item) => ({ id: item.id, label: <>{item.label}<span className="rounded-md bg-[var(--background)] px-1.5 py-0.5 text-xs tabular-nums">{item.count}</span></> }))}
      />
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-[#bce0ce] bg-[#eef8f1] p-4 text-sm text-[#197254]"
        >
          {notice}
        </p>
      )}
      {!canReview && (
        <p className="text-sm text-[var(--soft)]">
          يمكنك استعراض الأفكار ومتابعتها. يقرر الاعتماد مدير الإدارة أو مدير
          النظام.
        </p>
      )}
      {ideas.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => (
            <article
              key={idea.id}
              className="media-card flex min-w-0 flex-col p-5"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={idea.status} />
                <PriorityBadge priority={idea.priority} />
              </div>
              <h2 className="!text-base leading-relaxed">{idea.title}</h2>
              <CompanyLogo
                companyId={idea.companyId}
                decorative
                className="mt-2 h-9 w-28"
              />
              <p className="mt-2 text-xs text-[var(--soft)]">
                {data.companies.find((company) => company.id === idea.companyId)
                  ?.name || "شركة"}{" "}
                · {idea.department}
              </p>
              {idea.sourceProposal && (
                <p className="mt-2 text-xs text-[var(--primary)]">
                  مقدم الفكرة: {idea.sourceProposal.proposerName}
                </p>
              )}
              <p className="mt-4 line-clamp-3 text-sm text-[var(--soft)]">
                {idea.description}
              </p>
              <div className="mt-4">
                <Channels channels={idea.channels} />
              </div>
              <div className="my-4 flex flex-wrap justify-between gap-2 rounded-xl bg-[var(--background)] p-3 text-xs">
                <span>{countText(idea.quotations.length, "quote")}</span>
                <span>
                  {idea.quotations.length
                    ? `${Math.min(...idea.quotations.map((quote) => quote.amount)).toLocaleString("ar-SA")} ر.س. · أقل عرض`
                    : idea.needsQuotes
                      ? "تحتاج عروض أسعار"
                      : "تنفيذ داخلي"}
                </span>
              </div>
              {idea.managerFeedback && (
                <div className="mb-4 rounded-lg bg-[#fff1dc] p-3 text-xs text-[var(--warning)]">
                  <b className="mb-1 block">ملاحظات المراجعة</b>
                  <p className="break-words whitespace-pre-wrap">
                    {idea.managerFeedback}
                  </p>
                </div>
              )}
              <div className="mt-auto space-y-2">
                <ActionButton
                  onClick={() => onOpen(idea.id)}
                  className="w-full"
                >
                  {tab === "review" ? "مراجعة الفكرة والعرض" : "عرض التفاصيل"}
                  <Icon name="arrow" className="size-4" />
                </ActionButton>
                {canReview && idea.status === "review" && idea.ownerId === currentUser?.id && (
                  <p className="text-xs text-[var(--soft)]">يعتمد هذه الفكرة مدير آخر لأنك صاحبها.</p>
                )}
                {canReview && idea.status === "review" && idea.ownerId !== currentUser?.id && (
                  <div className="grid grid-cols-3 gap-2">
                    <ActionButton
                      primary
                      onClick={() => startDecision(idea, "approved")}
                      disabled={busy || saving}
                    >
                      <Icon name="check" className="size-4" />
                      اعتماد
                    </ActionButton>
                    <ActionButton
                      onClick={() => startDecision(idea, "changes")}
                      disabled={busy || saving}
                    >
                      إعادة للتعديل
                    </ActionButton>
                    <ActionButton
                      className="!text-[var(--danger)]"
                      onClick={() => startDecision(idea, "rejected")}
                      disabled={busy || saving}
                    >
                      رفض
                    </ActionButton>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            tab === "review"
              ? "لا توجد أفكار بانتظار الاعتماد"
              : "لا توجد أفكار في هذا القسم"
          }
          description="عندما يرسل فريق المحتوى فكرة للمراجعة، ستظهر هنا مع عرضها وجميع مرفقاتها."
        />
      )}
      <DecisionDialog
        decision={decision}
        selected={selected}
        closeDecision={closeDecision}
        saveDecision={saveDecision}
        feedbackField={feedbackField}
        feedback={feedback}
        setFeedback={setFeedback}
        error={error}
        busy={busy}
        saving={saving}
        canReview={canReview}
      />
    </div>
  );
}

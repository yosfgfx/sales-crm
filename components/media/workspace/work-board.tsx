"use client";

import { useState } from "react";
import { useMediaStore } from "@/stores/media-store";
import { STATUS_LABELS, type Idea, type MediaData } from "@/data/media";
import { ActionButton, countText, Icon } from "../ui";
import { IdeaCard } from "./idea-card";
import { IdeaList } from "./idea-list";

export function WorkBoard({
  mode,
  data,
  onOpen,
}: {
  mode: "content" | "design";
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  const [company, setCompany] = useState("all"),
    [category, setCategory] = useState("all"),
    [proposer, setProposer] = useState("all"),
    [mine, setMine] = useState(false),
    [showClosed, setShowClosed] = useState(false),
    [view, setView] = useState("board");
  const user = useMediaStore((s) => s.currentUser);
  const stages =
    mode === "content"
      ? ["draft", "quotations", "review", "changes", ...(showClosed ? ["rejected", "cancelled"] : [])]
      : ["approved", "scheduled", "designing", "design_review", "delivered"];
  const closedCount = data.ideas.filter((i) => i.status === "rejected" || i.status === "cancelled").length;
  const ideas = data.ideas.filter(
    (i) =>
      stages.includes(i.status) &&
      (company === "all" || i.companyId === company) &&
      (category === "all" || i.categoryId === category) &&
      (proposer === "all" ||
        (proposer === "__imported"
          ? !!i.sourceProposal
          : i.sourceProposal?.proposerName === proposer)) &&
      (!mine || i.ownerId === user?.id || i.designerId === user?.id),
  );
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {mode === "content" && closedCount > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              إظهار المرفوضة والملغاة ({closedCount})
            </label>
          )}
          <label>
            <span className="sr-only">تصفية حسب الشركة</span>
            <select
              className="media-input !w-auto"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="all">كل الشركات</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">تصفية حسب التصنيف</span>
            <select
              className="media-input !w-auto"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">كل التصنيفات</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {data.ideas.some((idea) => idea.sourceProposal) && (
            <label>
              <span className="sr-only">تصفية حسب مقدم الفكرة</span>
              <select
                className="media-input !w-auto"
                value={proposer}
                onChange={(event) => setProposer(event.target.value)}
              >
                <option value="all">كل مقدمي الأفكار</option>
                <option value="__imported">مقترحات الملف المرفق</option>
                {Array.from(
                  new Set(
                    data.ideas.flatMap((idea) =>
                      idea.sourceProposal
                        ? [idea.sourceProposal.proposerName]
                        : [],
                    ),
                  ),
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            أعمالي فقط
          </label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--soft)]">
            {countText(ideas.length, "work")}
          </span>
          <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-[var(--border)]">
            <ActionButton
              aria-label="عرض اللوحة"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={`size-9 px-0 !shadow-none ${view === "board" ? "!bg-[var(--accent)] !text-[var(--primary)]" : ""}`}
            >
              <Icon name="grid" className="size-4" />
            </ActionButton>
            <ActionButton
              aria-label="عرض القائمة"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`size-9 px-0 !shadow-none ${view === "list" ? "!bg-[var(--accent)] !text-[var(--primary)]" : ""}`}
            >
              <Icon name="list" className="size-4" />
            </ActionButton>
          </div>
        </div>
      </div>
      {view === "list" ? (
        <IdeaList ideas={ideas} data={data} onOpen={onOpen} />
      ) : (
        <div
          className={`grid items-start gap-4 min-[700px]:grid-cols-2 ${mode === "content" ? "xl:grid-cols-4" : "xl:grid-cols-3 2xl:grid-cols-5"}`}
        >
          {stages.map((stage) => (
            <section
              key={stage}
              className="min-w-0 rounded-2xl bg-[#ebedf4] p-3"
            >
              <div className="mb-4 flex items-center justify-between px-1 py-1">
                <h2 className="!text-sm">
                  {STATUS_LABELS[stage as Idea["status"]]}
                </h2>
                <span className="flex size-6 items-center justify-center rounded-md bg-white text-xs text-[var(--soft)]">
                  {ideas.filter((i) => i.status === stage).length}
                </span>
              </div>
              <div className="space-y-3">
                {ideas
                  .filter((i) => i.status === stage)
                  .sort(
                    (a, b) =>
                      rank[a.priority] - rank[b.priority] ||
                      a.dueDate.localeCompare(b.dueDate),
                  )
                  .map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      data={data}
                      onOpen={onOpen}
                    />
                  ))}
                {!ideas.some((i) => i.status === stage) && (
                  <div className="rounded-xl border border-dashed border-[#cdd2df] px-4 py-10 text-center text-xs leading-relaxed text-[var(--soft)]">
                    {stage === "approved"
                      ? "تنتقل الأفكار إلى هنا بعد اعتماد المدير."
                      : "لا توجد أعمال في هذه المرحلة."}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {mode === "design" && (
        <div className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm text-[var(--soft)]">
          <Icon name="screen" className="mt-0.5 size-4" />
          <p>
            تُرتَّب الأعمال حسب الأولوية والموعد. افتح أي عمل لجدولته وتسليم
            نسخة 16:9 للشاشات، و9:16 للواتساب، ونسخة مناسبة للإيميل حسب القنوات
            المطلوبة.
          </p>
        </div>
      )}
    </>
  );
}

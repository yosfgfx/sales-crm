"use client";

import { useState } from "react";
import Asset from "@/components/_ui/asset";
import { WORK_TYPE_LABELS, type MediaData } from "@/data/media";
import { CompanyLogo } from "./company-logo";
import {
  ActionButton,
  Channels,
  EmptyState,
  Icon,
  formatDate,
} from "./ui";

const ARCHIVE_LABELS: Record<string, string> = { done: "مؤرشف في Drive", pending: "بانتظار الأرشفة", running: "جارٍ الأرشفة", failed: "ستُعاد الأرشفة", needs_review: "الأرشفة تحتاج مراجعة", not_started: "لم يُؤرشف" };

export default function Archive({
  data,
  onOpenIdea,
}: {
  data: MediaData;
  onOpenIdea: (id: string) => void;
}) {
  const [month, setMonth] = useState("all"),
    [company, setCompany] = useState("all"),
    [type, setType] = useState("all");
  const ideas = data.ideas
    .filter(
      (i) =>
        i.status === "delivered" &&
        (month === "all" || i.deliveredAt?.startsWith(month)) &&
        (company === "all" || i.companyId === company) &&
        (type === "all" || i.workType === type),
    )
    .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""));
  const months = [
    ...new Set(
      data.ideas
        .filter((i) => i.status === "delivered")
        .map((i) => i.deliveredAt?.slice(0, 7))
        .filter(Boolean),
    ),
  ]
    .sort()
    .reverse() as string[];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="!text-base">الأعمال المسلّمة</h2>
        <span className="text-xs text-[var(--soft)]">
          كل النسخ النهائية مع تفاصيل طلبها
        </span>
      </div>
      {(
        <>
          <div className="flex flex-wrap gap-3">
            <label>
              <span className="sr-only">تصفية الأرشيف حسب الشهر</span>
              <select
                className="media-input !w-auto"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                <option value="all">كل الأشهر</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatDate(`${m}-01`, {
                      month: "long",
                      year: "numeric",
                      day: undefined,
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">تصفية الأرشيف حسب الشركة</span>
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
              <span className="sr-only">تصفية الأرشيف حسب نوع العمل</span>
              <select
                className="media-input !w-auto"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="all">كل أنواع الأعمال</option>
                {Object.entries(WORK_TYPE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {ideas.length ? (
            <div className="grid gap-5 min-[650px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {ideas.map((idea) => {
                const file =
                  idea.attachments.find(
                    (a) => a.kind === "final" && a.mime.startsWith("image/"),
                  ) || idea.attachments.find((a) => a.kind === "final");
                return (
                  <article key={idea.id} className="media-card overflow-hidden">
                    <ActionButton
                      aria-label={`عرض العمل: ${idea.title}`}
                      onClick={() => onOpenIdea(idea.id)}
                      className="relative !flex aspect-[16/9] h-auto w-full !rounded-none !bg-[#e8eaf3] !p-0 !shadow-none"
                    >
                      {file?.mime.startsWith("image/") ? (
                        <Asset
                          type="image"
                          width={16}
                          height={9}
                          sizes="(max-width: 768px) 100vw, 33vw"
                          alt={`معاينة ${idea.title}`}
                          src={file.url}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-[var(--soft)]">
                          <Icon
                            name={
                              idea.workType === "video" ||
                              idea.workType === "motion"
                                ? "screen"
                                : "file"
                            }
                            className="size-10"
                          />
                          <span className="text-xs">
                            {WORK_TYPE_LABELS[idea.workType]} · معاينة التفاصيل
                          </span>
                        </div>
                      )}
                      <span className="absolute start-3 top-3 rounded-md bg-white/90 px-2 py-1 text-xs text-[#20273c]">
                        {WORK_TYPE_LABELS[idea.workType]}
                      </span>
                    </ActionButton>
                    <div className="space-y-3 p-5">
                      <ActionButton
                        onClick={() => onOpenIdea(idea.id)}
                        className="h-auto !justify-start !rounded-none !p-0 text-start !whitespace-normal !shadow-none"
                      >
                        <span className="leading-relaxed font-bold">
                          {idea.title}
                        </span>
                      </ActionButton>
                      <p className="text-xs text-[var(--soft)]">
                        <CompanyLogo
                          companyId={idea.companyId}
                          decorative
                          className="mb-1 h-9 w-28"
                        />
                        <span className="block">
                          {
                            data.companies.find((c) => c.id === idea.companyId)
                              ?.name
                          }
                        </span>
                      </p>
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--soft)]">
                        <span>{formatDate(idea.deliveredAt)}</span>
                        <span>{ARCHIVE_LABELS[idea.archive?.status || "not_started"]}</span>
                        <span>
                          {
                            idea.attachments.filter((a) => a.kind === "final")
                              .length
                          }{" "}
                          ملفات نهائية
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                        <Channels channels={idea.channels} />
                        <ActionButton
                          onClick={() => onOpenIdea(idea.id)}
                          className="!px-2 !text-xs !shadow-none"
                        >
                          التفاصيل
                          <Icon name="arrow" className="size-3" />
                        </ActionButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="لم تُسلّم أعمال في هذا الاختيار"
              description="تظهر الأعمال هنا تلقائيًا بعد إرفاق النسخ النهائية وتسجيل التسليم من استوديو التصميم."
            />
          )}
        </>
      )}
    </>
  );
}

"use client";

import type { Dispatch, SetStateAction } from "react";
import { CHANNEL_LABELS, type Idea, type MediaData } from "@/data/media";
import { ActionButton, Channels, Icon, formatDate } from "../ui";

export function OverviewTab({
  idea,
  data,
  setTab,
}: {
  idea: Idea;
  data: MediaData;
  setTab: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2>الفكرة والهدف</h2>
        <p className="mt-3 max-w-[65em] whitespace-pre-wrap">
          {idea.description}
        </p>
      </section>
      <dl className="grid grid-cols-1 gap-4 rounded-2xl bg-[var(--background)] p-5 sm:grid-cols-2">
        {[
          { label: "الإدارة المستفيدة", value: idea.department },
          {
            label: "تصنيف المحتوى",
            value: data.categories.find(
              (c) => c.id === idea.categoryId,
            )?.name,
          },
          {
            label: "مسؤول المحتوى والتنسيق",
            value: data.members.find((m) => m.id === idea.ownerId)
              ?.name,
          },
          {
            label: "مسؤول التصميم",
            value:
              data.members.find((m) => m.id === idea.designerId)
                ?.name || "بانتظار الإسناد",
          },
          {
            label: "تاريخ الطلب",
            value: formatDate(idea.requestedAt, { year: "numeric" }),
          },
          {
            label: "موعد التسليم المطلوب",
            value: formatDate(idea.dueDate, { year: "numeric" }),
          },
          {
            label: "بداية التنفيذ",
            value: formatDate(idea.scheduledAt),
          },
          {
            label: "تاريخ التسليم الفعلي",
            value: idea.deliveredAt
              ? formatDate(idea.deliveredAt)
              : "لم يُسلّم بعد",
          },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-[var(--soft)]">
              {item.label}
            </dt>
            <dd className="mt-1 text-sm font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h2 className="mb-3">قنوات النشر</h2>
        <Channels channels={idea.channels} labels />
      </section>
      <div className="flex flex-wrap gap-3">
        <ActionButton onClick={() => setTab("presentation")}>
          <Icon name="report" className="size-4" />
          استعرض عرض الاعتماد
        </ActionButton>
        <ActionButton onClick={() => setTab("files")}>
          <Icon name="file" className="size-4" />
          استعرض المرفقات
        </ActionButton>
      </div>
    </div>
  );
}

export function ContentTab({
  idea,
}: {
  idea: Idea;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2>نص المحتوى</h2>
        <div className="mt-3 rounded-xl bg-[var(--background)] p-5">
          <p className="whitespace-pre-wrap">{idea.content}</p>
        </div>
      </section>
      <section>
        <h2>خطة التنفيذ</h2>
        <p className="mt-3 whitespace-pre-wrap">
          {idea.executionPlan}
        </p>
      </section>
      <section>
        <h2>المخرجات المتوقعة</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {idea.channels.map((c) => (
            <div
              key={c}
              className="rounded-xl border border-[var(--border)] p-4"
            >
              <Icon
                name={c === "screens" ? "screen" : c}
                className="mb-3 text-[var(--primary)]"
              />
              <span className="block font-medium">
                {CHANNEL_LABELS[c]}
              </span>
              <span className="text-xs text-[var(--soft)]">
                {c === "screens"
                  ? "نسخة أفقية بنسبة 16:9"
                  : c === "whatsapp"
                    ? "نسخة عمودية بنسبة 9:16"
                    : "تصميم للرسائل الداخلية"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

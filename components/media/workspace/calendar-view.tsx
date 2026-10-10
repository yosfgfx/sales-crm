"use client";

import { useState } from "react";
import type { Idea, MediaData } from "@/data/media";
import {
  ActionButton,
  EmptyState,
  Icon,
  StatusBadge,
  formatDate,
  today,
} from "../ui";

export function Calendar({
  data,
  onOpen,
}: {
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [kind, setKind] = useState("schedule");
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7)) - 1;
  const days = new Date(year, m + 1, 0).getDate(),
    offset = new Date(year, m, 1).getDay();
  const shift = (direction: number) => {
    const next = new Date(year, m + direction, 1);
    setMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const dateFor = (idea: Idea) =>
    kind === "schedule" ? idea.scheduledAt : idea.dueDate;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ActionButton
            onClick={() => shift(-1)}
            aria-label="الشهر السابق"
            className="size-10 px-0"
          >
            <Icon name="chevron" />
          </ActionButton>
          <label>
            <span className="sr-only">شهر التقويم</span>
            <input
              type="month"
              className="media-input !w-auto"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
          <ActionButton
            onClick={() => shift(1)}
            aria-label="الشهر التالي"
            className="size-10 px-0"
          >
            <Icon name="chevron" className="rotate-180" />
          </ActionButton>
          <ActionButton onClick={() => setMonth(today().slice(0, 7))}>
            اليوم
          </ActionButton>
        </div>
        <label className="flex items-center gap-3 text-sm">
          عرض المواعيد
          <select
            className="media-input !w-auto"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="schedule">جدولة التنفيذ</option>
            <option value="delivery">التسليم المطلوب</option>
          </select>
        </label>
      </div>
      <div className="media-card hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-white">
          {[
            "الأحد",
            "الإثنين",
            "الثلاثاء",
            "الأربعاء",
            "الخميس",
            "الجمعة",
            "السبت",
          ].map((d) => (
            <span
              key={d}
              className="p-4 text-center text-xs text-[var(--soft)]"
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from(
            { length: Math.ceil((days + offset) / 7) * 7 },
            (_, i) => {
              const d = i - offset + 1,
                valid = d > 0 && d <= days;
              const date = `${month}-${String(d).padStart(2, "0")}`;
              return (
                <div
                  key={i}
                  className={`min-h-[130px] min-w-0 border-e border-b border-[var(--border)] p-2 ${valid ? "bg-white" : "bg-[var(--background)]"}`}
                >
                  {valid && (
                    <>
                      <span
                        className={`mb-2 flex size-7 items-center justify-center rounded-full text-xs ${date === today() ? "bg-[var(--primary)] text-white" : "text-[var(--soft)]"}`}
                      >
                        {d.toLocaleString("ar-SA")}
                      </span>
                      <div className="space-y-1.5">
                        {data.ideas
                          .filter(
                            (idea) => dateFor(idea)?.slice(0, 10) === date,
                          )
                          .map((idea) => (
                            <ActionButton
                              key={idea.id}
                              onClick={() => onOpen(idea.id)}
                              className="h-auto w-full justify-start !rounded-md !bg-[var(--accent)] !p-2 !text-start text-xs !whitespace-normal !shadow-none"
                            >
                              <span className="leading-relaxed">
                                {idea.title}
                              </span>
                            </ActionButton>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const ideas = data.ideas.filter(
            (idea) => dateFor(idea)?.slice(0, 10) === date,
          );
          return ideas.length ? (
            <section key={date} className="media-card p-4">
              <h2 className="mb-3 !text-sm">
                {formatDate(date, { weekday: "long" })}
              </h2>
              <div className="space-y-2">
                {ideas.map((idea) => (
                  <ActionButton
                    key={idea.id}
                    onClick={() => onOpen(idea.id)}
                    className="h-auto w-full justify-between py-3 text-start !whitespace-normal"
                  >
                    <span className="leading-relaxed">{idea.title}</span>
                    <StatusBadge status={idea.status} />
                  </ActionButton>
                ))}
              </div>
            </section>
          ) : null;
        })}
        {!data.ideas.some((i) => dateFor(i)?.startsWith(month)) && (
          <EmptyState
            title="شهر بلا مواعيد مجدولة"
            description="حدّد موعد تنفيذ الأعمال من استوديو التصميم لتظهر هنا."
          />
        )}
      </div>
    </>
  );
}

"use client";

import type { MediaData } from "@/data/media";
import {
  ActionButton,
  countText,
  Icon,
  StatusBadge,
  formatDate,
  today,
  type IconName,
} from "../ui";
import { production, type View } from "./shared";

export function Overview({
  data,
  currentId,
  onOpen,
  onView,
}: {
  data: MediaData;
  currentId: string;
  onOpen: (id: string) => void;
  onView: (view: View) => void;
}) {
  const month = today().slice(0, 7);
  const complete = data.ideas.filter(
    (i) => i.status === "delivered" && i.deliveredAt?.startsWith(month),
  );
  const waiting = data.ideas.filter((i) => i.status === "review");
  const active = data.ideas.filter((i) => production.includes(i.status));
  const late = data.ideas.filter(
    (i) => i.dueDate < today() && !["delivered", "cancelled", "rejected", "draft"].includes(i.status),
  );
  const attention = data.ideas
    .filter(
      (i) =>
        i.status !== "delivered" &&
        (i.ownerId === currentId ||
          i.designerId === currentId ||
          i.status === "review"),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);
  const stats = [
    {
      value: complete.length,
      label: "أعمال مسلّمة هذا الشهر",
      icon: "check" as IconName,
      note: "موثّقة في الأرشيف",
      tone: "success",
    },
    {
      value: active.length,
      label: "أعمال في استوديو التصميم",
      icon: "design" as IconName,
      note: "معتمدة وجاهزة للتنفيذ",
      tone: "accent",
    },
    {
      value: waiting.length,
      label: "أفكار بانتظار الاعتماد",
      icon: "clock" as IconName,
      note: "الخطوة التالية لدى المدير",
      tone: "warning",
    },
    {
      value: late.length,
      label: "أعمال تجاوزت موعدها",
      icon: "calendar" as IconName,
      note: "تحتاج متابعة الفريق",
      tone: "neutral",
    },
  ];
  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-[#eeebfc] px-6 py-6 sm:px-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-[#5140b8]">
              <Icon name="spark" className="size-4" />
              الإبداع يبدأ بفكرة… ويكتمل مع الفريق
            </div>
            <h2>مسار واضح لكل فكرة. مساحة أكبر للإبداع.</h2>
            <p className="mt-2 max-w-[44em] text-[#5d5680]">
              المحتوى يضع الفكرة، المدير يعتمدها، والتصميم يمنحها الحياة. تابع
              كل خطوة من هنا.
            </p>
          </div>
          <ActionButton
            onClick={() => onView("ideas")}
            className="!bg-white/70"
          >
            استعرض مسار الأفكار
            <Icon name="arrow" className="size-4" />
          </ActionButton>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute end-[-40px] -bottom-16 size-60 rounded-full border-[28px] border-white/35"
        />
      </section>
      <section
        aria-label="إحصائيات الفريق"
        className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <div key={stat.label} className="media-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-[var(--soft)]">{stat.label}</span>
              <span
                className={`media-badge media-badge-${stat.tone} !rounded-lg !p-2`}
              >
                <Icon name={stat.icon} className="size-4" />
              </span>
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {stat.value.toLocaleString("ar-SA")}
            </div>
            <span className="mt-2 block text-xs text-[var(--soft)]">
              {stat.note}
            </span>
          </div>
        ))}
      </section>
      <section className="media-card p-5 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2>من الفكرة إلى الأثر</h2>
            <p className="mt-1 text-xs text-[var(--soft)]">
              حركة الأعمال عبر مراحل الفريق
            </p>
          </div>
          <span className="text-xs text-[var(--soft)]">
            {countText(data.ideas.length, "work")} في المساحة
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            {
              label: "كتابة المحتوى",
              statuses: ["draft", "quotations", "changes"],
              icon: "ideas",
              view: "ideas",
            },
            {
              label: "مراجعة المدير",
              statuses: ["review"],
              icon: "check",
              view: "approvals",
            },
            {
              label: "جدولة التصميم",
              statuses: ["approved", "scheduled"],
              icon: "calendar",
              view: "design",
            },
            {
              label: "التصميم والإنتاج",
              statuses: ["designing", "design_review"],
              icon: "design",
              view: "design",
            },
            {
              label: "التسليم والأرشفة",
              statuses: ["delivered"],
              icon: "archive",
              view: "archive",
            },
          ].map((stage, index) => (
            <ActionButton
              key={stage.label}
              onClick={() => onView(stage.view as View)}
              className="relative !flex h-auto flex-col gap-3 !rounded-xl !bg-[var(--background)] py-5 !shadow-none"
            >
              <span
                className={`flex size-10 items-center justify-center rounded-full ${index === 4 ? "bg-[#e6f4ee] text-[var(--success)]" : "bg-[var(--accent)] text-[var(--primary)]"}`}
              >
                <Icon name={stage.icon as IconName} />
              </span>
              <span className="text-xs">{stage.label}</span>
              <span className="text-xl font-bold tabular-nums">
                {data.ideas
                  .filter((i) => stage.statuses.includes(i.status))
                  .length.toLocaleString("ar-SA")}
              </span>
            </ActionButton>
          ))}
        </div>
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="media-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <div>
              <h2>تحتاج انتباهك</h2>
              <p className="mt-1 text-xs text-[var(--soft)]">
                المواعيد القريبة والمراجعات المعلّقة
              </p>
            </div>
            <ActionButton
              onClick={() => onView("calendar")}
              className="!px-3 !text-xs"
            >
              عرض التقويم
              <Icon name="arrow" className="size-3.5" />
            </ActionButton>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {attention.length ? (
              attention.map((idea) => (
                <ActionButton
                  key={idea.id}
                  onClick={() => onOpen(idea.id)}
                  className="h-auto w-full justify-between gap-4 !rounded-none px-6 py-4 text-start !whitespace-normal !shadow-none"
                >
                  <span className="min-w-0">
                    <span className="block text-sm leading-relaxed font-medium">
                      {idea.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[var(--soft)]">
                      {idea.department} · {formatDate(idea.dueDate)}
                    </span>
                  </span>
                  <StatusBadge status={idea.status} />
                </ActionButton>
              ))
            ) : (
              <div className="px-6 py-8 text-sm text-[var(--soft)]">
                لا توجد أعمال معلّقة لديك حاليًا.
              </div>
            )}
          </div>
        </section>
        <section className="media-card p-6">
          <div className="mb-5">
            <h2>توازن المحتوى</h2>
            <p className="mt-1 text-xs text-[var(--soft)]">
              توزيع أفكار هذا الشهر على التصنيفات
            </p>
          </div>
          <div className="space-y-4">
            {data.categories.map((category) => {
              const count = data.ideas.filter(
                (i) =>
                  i.categoryId === category.id &&
                  i.requestedAt.startsWith(month),
              ).length;
              const total = Math.max(
                1,
                data.ideas.filter((i) => i.requestedAt.startsWith(month))
                  .length,
              );
              return (
                <div key={category.id}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span>{category.name}</span>
                    <span className="text-[var(--soft)]">
                      {count ? countText(count, "idea") : "يحتاج محتوى"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
                    <div
                      className="h-full rounded-full bg-[#9c8fe8]"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 rounded-xl bg-[var(--background)] px-3 py-3 text-xs leading-relaxed text-[var(--soft)]">
            التصنيفات التي لم تُغطَّ بعد تساعد الفريق على التخطيط لمحتوى أكثر
            تنوعًا.
          </div>
        </section>
      </div>
    </>
  );
}

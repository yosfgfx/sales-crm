"use client";

import type { Dispatch, SetStateAction } from "react";
import { PRIORITY_LABELS, type Idea, type MediaData, type Priority, type TeamMember } from "@/data/media";
import { useMediaStore, type MediaState } from "@/stores/media-store";
import { ActionButton, Icon, today } from "../ui";
import type { ScheduleBaseline } from "./constants";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function ScheduleForm({
  idea,
  data,
  admin,
  currentUser,
  busy,
  run,
  store,
  designer,
  setDesigner,
  scheduled,
  setScheduled,
  due,
  setDue,
  priority,
  setPriority,
  scheduleBaseline,
  setScheduleBaseline,
  defaultDesigner,
}: {
  idea: Idea;
  data: MediaData;
  admin: boolean;
  currentUser: TeamMember | null;
  busy: boolean;
  run: Run;
  store: MediaState;
  designer: string;
  setDesigner: Setter<string>;
  scheduled: string;
  setScheduled: Setter<string>;
  due: string;
  setDue: Setter<string>;
  priority: Priority;
  setPriority: Setter<Priority>;
  scheduleBaseline: ScheduleBaseline;
  setScheduleBaseline: Setter<ScheduleBaseline>;
  defaultDesigner: () => string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await store.scheduleIdea(
            idea.id,
            {
              designerId: designer,
              scheduledAt: scheduled,
              dueDate: due,
              priority,
            },
            scheduleBaseline,
          );
          const saved = useMediaStore.getState().data.ideas.find((item) => item.id === idea.id)!;
          setScheduleBaseline({ designerId: saved.designerId, scheduledAt: saved.scheduledAt, dueDate: saved.dueDate, priority: saved.priority });
        }, "جُدول العمل وأُرسل إشعار للمصمم.");
      }}
      className="space-y-4 rounded-xl border border-[#c9bfec] bg-[#f8f6ff] p-5"
    >
      <h2 className="!text-base">جدولة التنفيذ وإسناد التصميم</h2>
      {(["designerId", "scheduledAt", "dueDate", "priority"] as const).some((key) => scheduleBaseline[key] !== idea[key]) && (
        <div className="rounded-xl bg-[#fff1dc] p-3 text-xs text-[var(--warning)]">
          تحدّثت بيانات العمل منذ فتحه. حمّل أحدث الجدولة قبل الحفظ.
          <ActionButton
            className="mt-2 !text-xs"
            onClick={() => {
              setDesigner(defaultDesigner());
              setScheduled(idea.scheduledAt || today());
              setDue(idea.dueDate);
              setPriority(idea.priority);
              setScheduleBaseline({ designerId: idea.designerId, scheduledAt: idea.scheduledAt, dueDate: idea.dueDate, priority: idea.priority });
            }}
          >
            تحميل أحدث بيانات الجدولة
          </ActionButton>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="media-label">
          المصمم المسؤول
          <select
            required
            className="media-input mt-2"
            value={designer}
            onChange={(e) => setDesigner(e.target.value)}
          >
            {data.members
              .filter(
                (m) =>
                  m.role === "designer" &&
                  m.active &&
                  (admin || m.id === currentUser?.id),
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <label className="media-label">
          الأولوية
          <select
            className="media-input mt-2"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {Object.entries(PRIORITY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="media-label">
          بداية التنفيذ
          <input
            type="date"
            required
            min={idea.requestedAt}
            className="media-input mt-2"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
        </label>
        <label className="media-label">
          موعد التسليم
          <input
            type="date"
            required
            min={scheduled}
            className="media-input mt-2"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
      </div>
      <ActionButton type="submit" disabled={busy}>
        <Icon name="calendar" className="size-4" />
        حفظ الجدولة
      </ActionButton>
    </form>
  );
}

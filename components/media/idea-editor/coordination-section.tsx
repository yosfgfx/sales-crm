"use client";

import {
  PRIORITY_LABELS,
  memberDisplayLabel,
  type NewIdeaInput,
  type Priority,
} from "@/data/media";
import type { MediaState } from "@/stores/media-store";
import { isAdministrator } from "@/lib/media-workflow";

type Update = <K extends keyof NewIdeaInput>(key: K, value: NewIdeaInput[K]) => void;

export function CoordinationSection({
  form,
  update,
  store,
}: {
  form: NewIdeaInput;
  update: Update;
  store: MediaState;
}) {
  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-6">
      <h2>التنسيق والمواعيد</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="media-label">
          مسؤول المحتوى والتنسيق
          <select
            className="media-input mt-2"
            value={form.ownerId}
            disabled={!isAdministrator(store.currentUser)}
            onChange={(e) => update("ownerId", e.target.value)}
          >
            {store.data.members
              .filter(
                (m) =>
                  (m.role === "content" || isAdministrator(m)) &&
                  m.active,
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {memberDisplayLabel(m)}
                </option>
              ))}
          </select>
        </label>
        <label className="media-label">
          الأولوية
          <select
            className="media-input mt-2"
            value={form.priority}
            onChange={(e) =>
              update("priority", e.target.value as Priority)
            }
          >
            {Object.entries(PRIORITY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="media-label">
          تاريخ الطلب
          <input
            type="date"
            required
            className="media-input mt-2"
            value={form.requestedAt}
            onChange={(e) => update("requestedAt", e.target.value)}
          />
        </label>
        <label className="media-label">
          موعد التسليم المطلوب
          <input
            type="date"
            required
            min={form.requestedAt}
            className="media-input mt-2"
            value={form.dueDate}
            onChange={(e) => update("dueDate", e.target.value)}
          />
        </label>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[var(--background)] p-4">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-[var(--primary)]"
          checked={form.needsQuotes}
          onChange={(e) => update("needsQuotes", e.target.checked)}
        />
        <span>
          <span className="block font-medium">
            يتطلب عروض أسعار من جهة خارجية
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--soft)]">
            تُجمع العروض ومرفقاتها داخل الفكرة قبل إرسالها للاعتماد.
          </span>
        </span>
      </label>
    </section>
  );
}

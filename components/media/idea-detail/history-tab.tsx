"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Idea, MediaData, TeamMember } from "@/data/media";
import type { MediaState } from "@/stores/media-store";
import { ActionButton, Icon, formatDate } from "../ui";

type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function HistoryTab({
  idea,
  data,
  admin,
  currentUser,
  busy,
  run,
  store,
  comment,
  setComment,
}: {
  idea: Idea;
  data: MediaData;
  admin: boolean;
  currentUser: TeamMember | null;
  busy: boolean;
  run: Run;
  store: MediaState;
  comment: string;
  setComment: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {[...idea.history].reverse().map((event) => (
          <div key={event.id} className="flex items-start gap-3">
            <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
              <Icon
                name={
                  event.action === "approved"
                    ? "check"
                    : event.action === "delivered"
                      ? "archive"
                      : "clock"
                }
                className="size-4"
              />
            </span>
            <div className="flex-1 rounded-xl bg-[var(--background)] px-4 py-3">
              <p className="whitespace-pre-wrap">{event.note}</p>
              <span className="mt-2 block text-xs text-[var(--soft)]">
                {
                  data.members.find((m) => m.id === event.actorId)
                    ?.name
                }{" "}
                · {formatDate(event.at)} ·{" "}
                <bdi>
                  {new Date(event.at).toLocaleTimeString("ar-SA", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Riyadh",
                  })}
                </bdi>
              </span>
            </div>
          </div>
        ))}
      </div>
      {(admin ||
        currentUser?.role === "manager" ||
        idea.ownerId === currentUser?.id ||
        idea.designerId === currentUser?.id) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await store.addComment(idea.id, comment);
              setComment("");
            }, "أُضيف التعليق إلى سجل العمل.");
          }}
          className="space-y-3"
        >
          <label className="media-label">
            إضافة تعليق للفريق
            <textarea
              rows={3}
              required
              maxLength={3000}
              className="media-input mt-2"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="ملاحظة أو تحديث يتعلق بتنفيذ الفكرة…"
            />
          </label>
          <ActionButton type="submit" disabled={busy}>
            إضافة التعليق
          </ActionButton>
        </form>
      )}
    </div>
  );
}

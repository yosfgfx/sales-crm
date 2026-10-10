"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Idea, MediaData } from "@/data/media";
import type { MediaState } from "@/stores/media-store";
import { ActionButton, Modal } from "../ui";
import { LIFECYCLE, type LifecycleDraft } from "./constants";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function LifecycleDialog({
  idea,
  busy,
  run,
  store,
  lifecycle,
  setLifecycle,
}: {
  idea: Idea;
  busy: boolean;
  run: Run;
  store: MediaState;
  lifecycle: LifecycleDraft | null;
  setLifecycle: Setter<LifecycleDraft | null>;
}) {
  return (
    <Modal
      open={Boolean(lifecycle)}
      onClose={() => setLifecycle(null)}
      locked={busy}
      title={lifecycle ? LIFECYCLE[lifecycle.kind].title : ""}
      description={lifecycle ? LIFECYCLE[lifecycle.kind].description : ""}
    >
      {lifecycle && (
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const text = lifecycle.text;
            void run(async () => {
              if (lifecycle.kind === "reject") await store.reviewIdea(idea.id, "rejected", text);
              if (lifecycle.kind === "cancel") await store.cancelIdea(idea.id, text);
              if (lifecycle.kind === "reopen") await store.reopenIdea(idea.id, text);
              if (lifecycle.kind === "delete") await store.deleteIdea(idea.id, text);
              setLifecycle(null);
            }, LIFECYCLE[lifecycle.kind].done);
          }}
        >
          <label className="media-label">
            {LIFECYCLE[lifecycle.kind].label}
            <textarea className="media-input mt-2" rows={4} autoFocus required={lifecycle.kind !== "delete"} maxLength={4000} value={lifecycle.text} onChange={(e) => setLifecycle({ ...lifecycle, text: e.target.value })} />
          </label>
          <ActionButton type="submit" primary={lifecycle.kind !== "delete"} className={lifecycle.kind === "delete" ? "!text-[var(--danger)]" : ""} disabled={busy}>{LIFECYCLE[lifecycle.kind].action}</ActionButton>
        </form>
      )}
    </Modal>
  );
}

export function ReassignDialog({
  idea,
  data,
  designStage,
  busy,
  run,
  store,
  reassign,
  setReassign,
}: {
  idea: Idea;
  data: MediaData;
  designStage: boolean;
  busy: boolean;
  run: Run;
  store: MediaState;
  reassign: { ownerId: string; designerId: string } | null;
  setReassign: Setter<{ ownerId: string; designerId: string } | null>;
}) {
  return (
    <Modal open={Boolean(reassign)} onClose={() => setReassign(null)} locked={busy} title="إعادة إسناد العمل" description="تنقل المسؤولية دون تغيير مرحلة العمل، ويُشعر المكلّف الجديد.">
      {reassign && (
        <form className="space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); void run(async () => { await store.reassignIdea(idea.id, { ownerId: reassign.ownerId, ...(designStage ? { designerId: reassign.designerId } : {}) }); setReassign(null); }, "أُعيد إسناد العمل."); }}>
          <label className="media-label">مسؤول المحتوى
            <select className="media-input mt-2" value={reassign.ownerId} onChange={(e) => setReassign({ ...reassign, ownerId: e.target.value })}>
              {data.members.filter((m) => m.active && ["content", "admin", "superadmin"].includes(m.role)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          {designStage && (
            <label className="media-label">المصمم
              <select className="media-input mt-2" value={reassign.designerId} onChange={(e) => setReassign({ ...reassign, designerId: e.target.value })}>
                <option value="">بدون مصمم</option>
                {data.members.filter((m) => m.active && m.role === "designer").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}
          <ActionButton type="submit" primary disabled={busy}>حفظ الإسناد</ActionButton>
        </form>
      )}
    </Modal>
  );
}

export function ReturnDialog({
  idea,
  busy,
  run,
  store,
  returnDialog,
  setReturnDialog,
  feedback,
  setFeedback,
}: {
  idea: Idea;
  busy: boolean;
  run: Run;
  store: MediaState;
  returnDialog: boolean;
  setReturnDialog: Setter<boolean>;
  feedback: string;
  setFeedback: Setter<string>;
}) {
  return (
    <Modal
      open={returnDialog}
      onClose={() => setReturnDialog(false)}
      locked={busy}
      title="إعادة الفكرة للتعديل"
      description="تظهر الملاحظة لمسؤول المحتوى حتى يعالجها ويعيد إرسال الفكرة."
    >
      <form
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await store.reviewIdea(idea.id, "changes", feedback);
            setReturnDialog(false);
          }, "أُعيدت الفكرة للتعديل وأُشعر مسؤول المحتوى.");
        }}
      >
        <label className="media-label">
          ملاحظة المدير
          <textarea
            className="media-input mt-2"
            rows={5}
            autoFocus
            required
            minLength={5}
            maxLength={4000}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="ما الذي يحتاج تعديلًا أو توضيحًا قبل الاعتماد؟"
          />
        </label>
        <ActionButton type="submit" primary disabled={busy}>
          إرسال الملاحظة وإعادة الفكرة
        </ActionButton>
      </form>
    </Modal>
  );
}

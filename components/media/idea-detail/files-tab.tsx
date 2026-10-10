"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { CHANNEL_LABELS, type Attachment, type Channel, type Idea } from "@/data/media";
import { postJson } from "@/lib/api-client";
import { useMediaStore, type MediaState } from "@/stores/media-store";
import ArchiveRepair from "../archive-repair";
import AttachmentLink from "../attachment-link";
import { ActionButton, Channels, Icon, bytes, formatDate } from "../ui";
import { ARCHIVE_TEXT } from "./constants";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Run = (action: () => Promise<unknown>, success: string) => Promise<void>;

export function FilesTab({
  idea,
  admin,
  canEdit,
  canDesign,
  designStage,
  busy,
  run,
  store,
  upload,
  kind,
  setKind,
  channel,
  setChannel,
  setUploading,
  setPendingUpload,
}: {
  idea: Idea;
  admin: boolean;
  canEdit: boolean;
  canDesign: boolean;
  designStage: boolean;
  busy: boolean;
  run: Run;
  store: MediaState;
  upload: (e: FormEvent) => Promise<void>;
  kind: Attachment["kind"];
  setKind: Setter<Attachment["kind"]>;
  channel: Channel;
  setChannel: Setter<Channel>;
  setUploading: Setter<File[]>;
  setPendingUpload: Setter<Attachment[]>;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-4">النسخ النهائية حسب قناة النشر</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {idea.channels.map((c) => {
            const finals = idea.attachments.filter(
              (a) => a.kind === "final" && a.channel === c,
            );
            return (
              <div
                key={c}
                className="rounded-xl border border-[var(--border)] p-4"
              >
                <Channels channels={[c]} labels />
                <span
                  className={`mt-3 block text-xs ${finals.length ? "text-[var(--success)]" : "text-[var(--warning)]"}`}
                >
                  {finals.length
                    ? `${finals.length} نسخ محفوظة`
                    : "لم تُرفق النسخة النهائية"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <div className="space-y-3">
        {idea.attachments.map((file) => (
          <div
            key={file.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--background)] p-4"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="rounded-lg bg-white p-2 text-[var(--primary)]">
                <Icon name="file" />
              </span>
              <div className="min-w-0">
                <AttachmentLink
                  file={file}
                  className="block text-sm font-medium break-all underline decoration-[#c9c3dd] underline-offset-4"
                >
                  <bdi>{file.name}</bdi>
                </AttachmentLink>
                <span className="mt-1 block text-xs text-[var(--soft)]">
                  <bdi>{bytes(file.size)}</bdi> ·{" "}
                  {file.kind === "brief"
                    ? "مرجع الفكرة"
                    : file.kind === "quotation"
                      ? "عرض سعر"
                      : "نسخة نهائية"}
                  {file.channel &&
                    ` · ${CHANNEL_LABELS[file.channel]}`}
                </span>
              </div>
            </div>
            <AttachmentLink
              file={file}
              label={`تنزيل ${file.name}`}
              download
              className="rounded-lg bg-white p-2.5 text-[var(--soft)]"
            >
              <Icon name="download" className="size-4" />
            </AttachmentLink>
            {((canEdit && file.kind !== "final") ||
              (canDesign &&
                designStage &&
                file.kind === "final")) && (
              <ActionButton
                aria-label={`حذف ${file.name}`}
                onClick={() => {
                  if (
                    window.confirm(
                      "إزالة المرفق من الفكرة؟ تبقى النسخة الأصلية محفوظة على الخادم.",
                    )
                  )
                    void run(
                      () => store.removeAttachment(idea.id, file.id),
                      "أُزيل المرفق من الفكرة.",
                    );
                }}
                className="size-9 px-0 !text-[var(--danger)]"
              >
                <Icon name="close" className="size-4" />
              </ActionButton>
            )}
          </div>
        ))}
      </div>
      {idea.status === "delivered" && (
        <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <h2 className="!text-base">الأرشفة في Google Drive</h2>
          <p className="text-sm text-[var(--soft)]">
            {ARCHIVE_TEXT[idea.archive?.status || "not_started"]}
            {idea.archive?.archivedAt ? ` · ${formatDate(idea.archive.archivedAt)}` : ""}
          </p>
          {admin && idea.archive?.folderUrl && (
            <a className="text-sm text-[var(--primary)] underline underline-offset-4" href={idea.archive.folderUrl} target="_blank" rel="noopener noreferrer">
              فتح مجلد المشروع في Drive
            </a>
          )}
          {admin && ["failed", "needs_review", "not_started"].includes(idea.archive?.status || "not_started") && (
            <ActionButton
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await postJson("/api/integrations/google", { action: "retryArchive", ideaId: idea.id });
                  await useMediaStore.getState().refresh();
                }, "أُعيدت محاولة الأرشفة.")
              }
            >
              <Icon name="refresh" className="size-4" />
              إعادة محاولة الأرشفة
            </ActionButton>
          )}
          {admin && idea.archive?.status === "done" && <ArchiveRepair ideaId={idea.id} />}
        </section>
      )}
      {(canEdit ||
        (canDesign &&
          ["scheduled", "designing", "design_review"].includes(idea.status))) && (
        <form
          onSubmit={upload}
          className="space-y-4 rounded-xl border border-dashed border-[var(--input)] p-5"
        >
          <h2 className="!text-base">إضافة مرفقات</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="media-label">
              نوع المرفق
              <select
                className="media-input mt-2"
                value={canEdit ? kind : "final"}
                onChange={(e) =>
                  setKind(e.target.value as Attachment["kind"])
                }
                disabled={!canEdit}
              >
                {canEdit && (
                  <>
                    <option value="brief">مرجع الفكرة</option>
                    <option value="quotation">عرض سعر</option>
                  </>
                )}
                {!canEdit && (
                  <option value="final">نسخة نهائية للأرشفة</option>
                )}
              </select>
            </label>
            {(!canEdit || kind === "final") && (
              <label className="media-label">
                قناة النسخة النهائية
                <select
                  className="media-input mt-2"
                  value={channel}
                  onChange={(e) =>
                    setChannel(e.target.value as Channel)
                  }
                >
                  {idea.channels.map((c) => (
                    <option key={c} value={c}>
                      {CHANNEL_LABELS[c]} ·{" "}
                      {c === "screens"
                        ? "16:9"
                        : c === "whatsapp"
                          ? "9:16"
                          : "بريد"}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label className="media-label">
            اختر الملفات
            <input
              type="file"
              required
              multiple
              className="media-input mt-2"
              onChange={(e) => {
                setUploading(Array.from(e.target.files || []));
                setPendingUpload([]);
                if (!canEdit) setKind("final");
              }}
            />
          </label>
          <p className="text-xs text-[var(--soft)]">
            جميع أنواع الملفات · حتى 2 GB للملف. أرفق نسخة نهائية لكل
            قناة مطلوبة قبل التسليم.
          </p>
          <ActionButton type="submit" disabled={busy}>
            <Icon name="upload" className="size-4" />
            {busy ? "جارٍ رفع الملفات…" : "رفع الملفات وحفظها"}
          </ActionButton>
        </form>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { CHANNEL_LABELS, type Channel, type Idea } from "@/data/media";
import { uploadFiles } from "@/lib/upload-client";
import { useMediaStore } from "@/stores/media-store";
import AttachmentLink from "../attachment-link";
import { Icon, bytes, errorText } from "../ui";

const FORMATS: Record<Channel, string> = { screens: "أفقي 16:9", whatsapp: "عمودي 9:16", email: "نسخة البريد" };
type Slot = Channel | "showcase";

function DriveMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 24" className="size-8 shrink-0 drop-shadow-[0_4px_5px_rgba(32,39,60,.22)]">
      <defs>
        <linearGradient id="delivery-drive-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FD69C" /><stop offset="1" stopColor="#1E8A5F" /></linearGradient>
        <linearGradient id="delivery-drive-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFC56B" /><stop offset="1" stopColor="#E08A1E" /></linearGradient>
        <linearGradient id="delivery-drive-c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8F80F0" /><stop offset="1" stopColor="#5140B8" /></linearGradient>
      </defs>
      <path d="M9.5 1h9l9 15.5h-9z" fill="url(#delivery-drive-b)" />
      <path d="M9.5 1 .5 16.5 5 24l9-15.5z" fill="url(#delivery-drive-a)" />
      <path d="M5 24h18l4.5-7.5h-18z" fill="url(#delivery-drive-c)" />
    </svg>
  );
}

export function DeliveryPanel({ idea, canUpload }: { idea: Idea; canUpload: boolean }) {
  const store = useMediaStore();
  const [busy, setBusy] = useState<Slot | null>(null),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const finals = idea.attachments.filter((file) => file.kind === "final");
  const ready = idea.channels.filter((channel) => finals.some((file) => file.channel === channel)).length;
  const showcase = finals.filter((file) => !file.channel);
  const upload = async (slot: Slot, files: File[]) => {
    if (!files.length) return;
    setBusy(slot);
    setProgress(0);
    setMessage(null);
    try {
      const attachments = await uploadFiles(files, idea.id, "final", slot === "showcase" ? undefined : slot, (sent, total) => setProgress(total ? Math.round((sent / total) * 100) : 0));
      const latest = useMediaStore.getState().data.ideas.find((item) => item.id === idea.id);
      const missing = attachments.filter((file) => !latest?.attachments.some((stored) => stored.id === file.id));
      if (missing.length) await store.addAttachments(idea.id, missing);
      setMessage({ text: "حُفظت الملفات في العمل، وستُرفع إلى Google Drive بعد تسجيل التسليم.", error: false });
    } catch (error) {
      setMessage({ text: errorText(error), error: true });
    } finally {
      setBusy(null);
    }
  };
  const slots: { id: Slot; title: string; hint: string; files: typeof finals; required: boolean }[] = [
    ...idea.channels.map((channel) => ({ id: channel as Slot, title: CHANNEL_LABELS[channel], hint: FORMATS[channel], files: finals.filter((file) => file.channel === channel), required: true })),
    { id: "showcase", title: "الشكل النهائي للعمل", hint: "معاينة أو ملفات المصدر · اختياري", files: showcase, required: false },
  ];
  return (
    <section aria-labelledby="delivery-title" className="space-y-4 rounded-2xl border border-[#cfe9dc] bg-[#f4fbf7] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <DriveMark />
          <div>
            <h2 id="delivery-title" className="!text-base">التسليم النهائي</h2>
            <p className="mt-1 text-sm text-[var(--soft)]">
              أرفق التصميم النهائي لكل قناة والشكل النهائي للعمل. بعد تسجيل التسليم تُرفع كلها تلقائياً إلى مجلد المشروع في Google Drive المرتبط بالنظام.
            </p>
          </div>
        </div>
        <span className="media-badge media-badge-success tabular-nums">
          {ready.toLocaleString("ar-SA")} من {idea.channels.length.toLocaleString("ar-SA")} قنوات جاهزة
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
        <div className="h-full rounded-full bg-[#1E8A5F] transition-[width] duration-500 ease-[var(--ease-power2-out)]" style={{ width: `${idea.channels.length ? (ready / idea.channels.length) * 100 : 0}%` }} />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <li key={slot.id} className={`rounded-xl border bg-white p-4 ${slot.files.length ? "border-[#a9d9c4]" : slot.required ? "border-[#f0d3a8]" : "border-[var(--border)]"}`}>
            <div className="flex items-start justify-between gap-2">
              <span>
                <strong className="block text-sm">{slot.title}</strong>
                <span className="text-xs text-[var(--soft)]">{slot.hint}</span>
              </span>
              <span className={`text-xs font-medium ${slot.files.length ? "text-[#197254]" : slot.required ? "text-[#8A4B0A]" : "text-[var(--soft)]"}`}>
                {slot.files.length ? `${slot.files.length.toLocaleString("ar-SA")} ملف` : slot.required ? "مطلوب" : "اختياري"}
              </span>
            </div>
            {slot.files.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {slot.files.map((file) => (
                  <li key={file.id} className="flex items-center gap-2">
                    <Icon name="check" className="size-3.5 text-[#197254]" />
                    <AttachmentLink file={file} className="min-w-0 break-all underline underline-offset-4">
                      <bdi>{file.name}</bdi>
                    </AttachmentLink>
                    <span className="text-[var(--soft)]">{bytes(file.size)}</span>
                  </li>
                ))}
              </ul>
            )}
            {canUpload && (
              <label className={`mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-sm font-medium ${busy === slot.id ? "border-[#1E8A5F] text-[#197254]" : "border-[#c6bcdf] text-[var(--primary)] hover:bg-[var(--accent)]"}`}>
                <Icon name="upload" className="size-4" />
                {busy === slot.id ? `جارٍ الرفع ${progress.toLocaleString("ar-SA")}٪` : slot.files.length ? "إضافة ملف آخر" : "رفع الملف"}
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  disabled={!!busy}
                  aria-label={`رفع ${slot.title}`}
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    event.target.value = "";
                    void upload(slot.id, files);
                  }}
                />
              </label>
            )}
          </li>
        ))}
      </ul>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-[var(--danger)]" : "text-[#197254]"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

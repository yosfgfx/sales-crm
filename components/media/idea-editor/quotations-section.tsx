"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { Attachment, Idea } from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { uploadFiles } from "@/lib/upload-client";
import AttachmentLink from "../attachment-link";
import { ActionButton, Icon, bytes, errorText } from "../ui";

export interface QuotationDraft {
  id: string;
  vendor: string;
  scope: string;
  amount: number;
  days: number;
  recommended: boolean;
  file: File;
  attachment?: Attachment;
}

const empty = { vendor: "", scope: "", amount: "", days: "", recommended: false };

export async function saveQuotationDrafts(
  ideaId: string,
  drafts: QuotationDraft[],
  onProgress: (drafts: QuotationDraft[]) => void,
) {
  const store = useMediaStore.getState();
  let remaining = [...drafts];
  for (const draft of drafts) {
    const attachment =
      draft.attachment || (await uploadFiles([draft.file], ideaId, "quotation"))[0];
    remaining = remaining.map((item) => (item.id === draft.id ? { ...item, attachment } : item));
    onProgress(remaining);
    const latest = () => useMediaStore.getState().data.ideas.find((item) => item.id === ideaId);
    if (!latest()?.attachments.some((file) => file.id === attachment.id))
      await store.addAttachments(ideaId, [attachment]);
    if (!latest()?.quotations.some((quote) => quote.id === draft.id))
      await store.addQuotation(ideaId, {
        id: draft.id,
        vendor: draft.vendor,
        scope: draft.scope,
        amount: draft.amount,
        days: draft.days,
        recommended: draft.recommended,
        attachmentId: attachment.id,
      });
    remaining = remaining.filter((item) => item.id !== draft.id);
    onProgress(remaining);
  }
}

export function QuotationsSection({
  idea,
  drafts,
  setDrafts,
}: {
  idea?: Idea;
  drafts: QuotationDraft[];
  setDrafts: Dispatch<SetStateAction<QuotationDraft[]>>;
}) {
  const store = useMediaStore();
  const [entry, setEntry] = useState(empty),
    [file, setFile] = useState<File | null>(null),
    [fileKey, setFileKey] = useState(0),
    [message, setMessage] = useState(""),
    [removing, setRemoving] = useState("");
  const saved = idea?.quotations || [];
  const add = () => {
    const amount = Number(entry.amount), days = Number(entry.days);
    if (!entry.vendor.trim() || !entry.scope.trim()) return setMessage("اكتب اسم المورد ونطاق العمل.");
    if (!(amount > 0)) return setMessage("أدخل قيمة العرض بالريال.");
    if (!Number.isInteger(days) || days < 1 || days > 3650) return setMessage("أدخل مدة التنفيذ بالأيام.");
    if (!file) return setMessage("أرفق ملف عرض السعر.");
    setDrafts((current) => [
      ...current.map((item) => (entry.recommended ? { ...item, recommended: false } : item)),
      { id: crypto.randomUUID(), vendor: entry.vendor.trim(), scope: entry.scope.trim(), amount, days, recommended: entry.recommended, file },
    ]);
    setEntry(empty);
    setFile(null);
    setFileKey((key) => key + 1);
    setMessage("");
  };
  const remove = async (quoteId: string) => {
    if (!idea) return;
    setRemoving(quoteId);
    setMessage("");
    try {
      await store.removeQuotation(idea.id, quoteId);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setRemoving("");
    }
  };
  return (
    <div className="space-y-3 rounded-2xl border border-[#d9d2f6] bg-[#fbfaff] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="!text-base">عروض الأسعار</h3>
        <span className="text-xs text-[var(--soft)]">
          {(saved.length + drafts.length).toLocaleString("ar-SA")} عرض · تُرفق مع الفكرة عند الحفظ
        </span>
      </div>
      {[...saved.map((quote) => ({ quote, draft: false })), ...drafts.map((quote) => ({ quote, draft: true }))].map(({ quote, draft }) => {
        const attachment = "attachmentId" in quote ? idea?.attachments.find((item) => item.id === quote.attachmentId) : undefined;
        return (
          <div key={quote.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-3 ${quote.recommended ? "border-[#c0b4e8]" : "border-[var(--border)]"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {quote.vendor}
                {quote.recommended && <span className="media-badge media-badge-accent ms-2">موصى به</span>}
                {draft && <span className="media-badge ms-2">يُرفع عند الحفظ</span>}
              </p>
              <p className="mt-1 text-xs text-[var(--soft)]">
                <bdi>{quote.amount.toLocaleString("ar-SA")}</bdi> ر.س · {quote.days.toLocaleString("ar-SA")} يوم · {quote.scope}
              </p>
              {"file" in quote && quote.file instanceof File && (
                <p className="mt-1 text-xs text-[var(--soft)]"><bdi>{quote.file.name}</bdi> · <bdi>{bytes(quote.file.size)}</bdi></p>
              )}
              {attachment && <AttachmentLink file={attachment} className="mt-1 inline-block text-xs underline underline-offset-4"><bdi>{attachment.name}</bdi></AttachmentLink>}
            </div>
            <ActionButton
              aria-label={`حذف عرض ${quote.vendor}`}
              disabled={removing === quote.id}
              onClick={() => (draft ? setDrafts((current) => current.filter((item) => item.id !== quote.id)) : remove(quote.id))}
              className="size-9 px-0"
            >
              <Icon name="close" className="size-3.5" />
            </ActionButton>
          </div>
        );
      })}
      <div className="grid gap-3 rounded-xl bg-white p-3 sm:grid-cols-2">
        <label className="media-label">
          اسم المورد
          <input className="media-input mt-2" maxLength={150} value={entry.vendor} onChange={(e) => setEntry({ ...entry, vendor: e.target.value })} />
        </label>
        <label className="media-label">
          ملف عرض السعر
          <input key={fileKey} className="media-input mt-2" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <label className="media-label sm:col-span-2">
          نطاق العمل
          <textarea className="media-input mt-2" rows={2} maxLength={4000} value={entry.scope} onChange={(e) => setEntry({ ...entry, scope: e.target.value })} />
        </label>
        <label className="media-label">
          قيمة العرض بالريال
          <input className="media-input mt-2" type="number" min="0.01" step="0.01" inputMode="decimal" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
        </label>
        <label className="media-label">
          مدة التنفيذ بالأيام
          <input className="media-input mt-2" type="number" min="1" max="3650" inputMode="numeric" value={entry.days} onChange={(e) => setEntry({ ...entry, days: e.target.value })} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={entry.recommended} onChange={(e) => setEntry({ ...entry, recommended: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          التوصية بهذا العرض
        </label>
        <div className="flex items-center justify-end">
          <ActionButton onClick={add}>
            <Icon name="plus" className="size-4" />
            إضافة العرض
          </ActionButton>
        </div>
      </div>
      {message && <p role="alert" className="text-sm text-[var(--danger)]">{message}</p>}
    </div>
  );
}

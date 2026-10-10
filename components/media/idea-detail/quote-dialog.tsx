"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { Attachment } from "@/data/media";
import { ActionButton, Modal } from "../ui";

type Setter<T> = Dispatch<SetStateAction<T>>;

export function QuoteDialog({
  quoteOpen,
  setQuoteOpen,
  busy,
  addQuote,
  message,
  vendor,
  setVendor,
  scope,
  setScope,
  amount,
  setAmount,
  days,
  setDays,
  recommended,
  setRecommended,
  setQuoteFile,
  setPendingQuoteAttachment,
}: {
  quoteOpen: boolean;
  setQuoteOpen: Setter<boolean>;
  busy: boolean;
  addQuote: (e: FormEvent) => Promise<void>;
  message: string;
  vendor: string;
  setVendor: Setter<string>;
  scope: string;
  setScope: Setter<string>;
  amount: string;
  setAmount: Setter<string>;
  days: string;
  setDays: Setter<string>;
  recommended: boolean;
  setRecommended: Setter<boolean>;
  setQuoteFile: Setter<File | null>;
  setPendingQuoteAttachment: Setter<Attachment | null>;
}) {
  return (
    <Modal
      open={quoteOpen}
      onClose={() => setQuoteOpen(false)}
      locked={busy}
      title="إضافة عرض سعر"
      description="بيانات المورد والعرض وملفه الأصلي للمقارنة والاعتماد."
    >
      <form className="space-y-4 p-6" onSubmit={addQuote}>
        <label className="media-label">
          اسم المورد
          <input
            className="media-input mt-2"
            required
            maxLength={150}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </label>
        <label className="media-label">
          نطاق العمل
          <textarea
            className="media-input mt-2"
            required
            rows={3}
            maxLength={4000}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="media-label">
            قيمة العرض بالريال
            <input
              className="media-input mt-2"
              type="number"
              required
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="media-label">
            مدة التنفيذ بالأيام
            <input
              className="media-input mt-2"
              type="number"
              required
              min="1"
              max="3650"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </label>
        </div>
        <label className="media-label">
          ملف عرض السعر
          <input
            className="media-input mt-2"
            type="file"
            required
            onChange={(e) => {
              setQuoteFile(e.target.files?.[0] || null);
              setPendingQuoteAttachment(null);
            }}
          />
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            checked={recommended}
            onChange={(e) => setRecommended(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          التوصية بهذا العرض
        </label>
        {message && (
          <p role="status" className="text-[var(--danger)]">
            {message}
          </p>
        )}
        <ActionButton type="submit" primary disabled={busy}>
          {busy ? "جارٍ رفع العرض…" : "حفظ عرض السعر"}
        </ActionButton>
      </form>
    </Modal>
  );
}

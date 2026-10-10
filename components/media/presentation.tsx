"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Idea, MediaData } from "@/data/media";
import {
  composeApprovalSlides,
  exportApprovalBundle,
  exportIdeaPresentation,
} from "@/lib/media-exports";
import { ActionButton, Icon, errorText } from "@/components/media/ui";
import { CompanyLogo } from "@/components/media/company-logo";

export function PresentationPreview({
  idea,
  data,
}: {
  idea: Idea;
  data: MediaData;
}) {
  const slides = useMemo(() => composeApprovalSlides(idea, data), [idea, data]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<"pptx" | "zip" | null>(null);
  const [error, setError] = useState("");
  const current = Math.min(index, slides.length - 1);
  const slide = slides[current];

  async function download(kind: "pptx" | "zip") {
    setBusy(kind);
    setError("");
    try {
      if (kind === "pptx") await exportIdeaPresentation(idea, data);
      else await exportApprovalBundle(idea, data);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">عرض الفكرة للاعتماد</h3>
          <p className="mt-1 text-xs leading-6 text-[var(--soft)]">
            يتحدث تلقائياً من تفاصيل الفكرة وعروض الأسعار والمرفقات.
          </p>
        </div>
        <span className="rounded-lg bg-[var(--accent)] px-3 py-1 text-xs text-[var(--primary)]">
          {slides.length} شرائح
        </span>
      </div>
      <div
        className={`relative min-h-[260px] overflow-hidden rounded-xl border border-[var(--border)] p-6 sm:aspect-video sm:p-8 ${slide.kind === "cover" ? "bg-[#182548] text-white" : "bg-[#f7f9fd] text-[#24334d]"}`}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-[#665ce1]" />
        <div className="flex items-center justify-between gap-4">
          <p
            className={`text-[10px] ${slide.kind === "cover" ? "text-[#aabbdd]" : "text-[#8997af]"}`}
          >
            {idea.code} · {data.settings.departmentName}
          </p>
          <span dir="ltr" className="text-[10px] opacity-60">
            {current + 1} / {slides.length}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <CompanyLogo
            companyId={idea.companyId}
            companyName={
              data.companies.find((company) => company.id === idea.companyId)
                ?.name
            }
            className="h-12 w-36"
          />
          {data.settings.logoUrl && (
            <span className="flex h-12 w-36 items-center justify-center rounded-lg bg-white p-2">
              <Image
                unoptimized
                src={data.settings.logoUrl}
                width={180}
                height={55}
                alt={data.settings.departmentName}
                className="h-full w-full object-contain"
              />
            </span>
          )}
        </div>
        <h4
          className={`mt-6 text-xl font-semibold sm:text-2xl ${slide.kind === "cover" ? "text-white" : "text-[#1c2d52]"}`}
        >
          {slide.title}
        </h4>
        <div
          className={`mt-4 ${slide.attachment?.mime.startsWith("image/") ? "grid gap-5 sm:grid-cols-2" : ""}`}
        >
          <div className="space-y-2 text-xs leading-6 sm:text-sm">
            {slide.paragraphs.map((paragraph, key) => (
              <p key={key} className="break-words whitespace-pre-wrap">
                {paragraph}
              </p>
            ))}
          </div>
          {slide.attachment?.mime.startsWith("image/") && (
            <div className="relative h-40 w-full rounded-lg bg-white">
              <Image
                unoptimized
                fill
                sizes="(max-width: 640px) 90vw, 400px"
                src={slide.attachment.url}
                alt={slide.attachment.name}
                className="rounded-lg object-contain"
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <ActionButton
          aria-label="الشريحة السابقة"
          onClick={() => setIndex(Math.max(0, current - 1))}
          disabled={current === 0}
          className="min-h-9 px-3 text-xs"
        >
          <Icon name="chevron" className="size-3.5" />
          السابق
        </ActionButton>
        <div
          className="flex max-w-[55%] items-center gap-1 overflow-x-auto px-1 py-2"
          aria-label="شرائح العرض"
        >
          {slides.map((item, slideIndex) => (
            <button
              key={`${item.title}-${slideIndex}`}
              onClick={() => setIndex(slideIndex)}
              aria-label={`شريحة ${slideIndex + 1}: ${item.title}`}
              aria-current={slideIndex === current ? "step" : undefined}
              className={`size-2 shrink-0 rounded-full transition-colors ${slideIndex === current ? "bg-[var(--primary)]" : "bg-[#d9deea]"}`}
            />
          ))}
        </div>
        <ActionButton
          aria-label="الشريحة التالية"
          onClick={() => setIndex(Math.min(slides.length - 1, current + 1))}
          disabled={current === slides.length - 1}
          className="min-h-9 px-3 text-xs"
        >
          التالي
          <Icon name="arrow" className="size-3.5" />
        </ActionButton>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-xs text-red-700"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
        <ActionButton
          primary
          onClick={() => void download("pptx")}
          disabled={!!busy}
        >
          <Icon name="download" className="size-4" />
          {busy === "pptx" ? "جارٍ إنشاء العرض…" : "تنزيل PowerPoint"}
        </ActionButton>
        <ActionButton onClick={() => void download("zip")} disabled={!!busy}>
          <Icon name="archive" className="size-4" />
          {busy === "zip" ? "جارٍ تجهيز الحزمة…" : "حزمة الاعتماد والمرفقات"}
        </ActionButton>
      </div>
      <p className="text-xs leading-6 text-[var(--soft)]">
        يتضمن العرض البيانات ومقارنة الأسعار ومعاينات الصور. تضم حزمة الاعتماد
        ZIP العرض وجميع الملفات الأصلية، بما فيها عروض الأسعار بصيغة PDF أو أي
        صيغة أخرى.
      </p>
    </div>
  );
}

export default PresentationPreview;

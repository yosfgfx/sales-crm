"use client";

import type { Dispatch, SetStateAction } from "react";
import Asset from "@/components/_ui/asset";
import type { MediaData } from "@/data/media";
import type { monthlyReport } from "@/lib/media-exports";
import { ActionButton, Icon } from "../ui";

export function ReportCover({
  data,
  report,
  setPreview,
}: {
  data: MediaData;
  report: ReturnType<typeof monthlyReport>;
  setPreview: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <section className="media-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h3 className="font-semibold">تقرير جاهز للإرسال</h3>
        <span className="text-xs text-[var(--soft)]">A4 · عمودي</span>
      </div>
      <div className="bg-[#eef0f6] p-6">
        <div
          className="relative mx-auto aspect-[210/297] w-full max-w-[305px] overflow-hidden rounded-sm bg-[#182548] text-white shadow-[0_10px_35px_#23314b20]"
          style={{ containerType: "inline-size" }}
        >
          <div className="absolute inset-[8%] flex flex-col items-start">
            {data.settings.logoUrl ? (
              <div className="inline-flex max-w-full rounded-lg bg-white px-[3cqi] py-[2cqi]">
                <Asset
                  type="image"
                  src={data.settings.logoUrl}
                  width={9}
                  height={2}
                  fit="contain"
                  sizes="240px"
                  alt={data.settings.departmentName}
                  className="h-[12cqi] w-auto max-w-full"
                />
              </div>
            ) : (
              <p className="text-[3.5cqi] text-[#c7d3f3]">
                {data.settings.departmentName}
              </p>
            )}
            <p className="mt-[11cqi] text-[3.6cqi] text-[#adbfe8]">
              التقرير الشهري
            </p>
            <h4 className="mt-[3cqi] text-[8cqi] leading-[1.5] font-semibold">
              أعمال فريق
              <br />
              التواصل الداخلي
            </h4>
            <p className="mt-[3cqi] text-[3cqi] text-[#c1cae5]">
              {data.settings.departmentName}
            </p>
            <span className="mt-[5cqi] inline-flex rounded-full bg-[#655ce1] px-[6cqi] py-[2cqi] text-[3.5cqi]">
              {report.label}
            </span>
            <div className="mt-[6cqi] flex items-center gap-[4cqi]">
              <b className="text-[12cqi] leading-none tabular-nums">
                {report.count}
              </b>
              <span className="text-[3cqi] text-[#c1cae5]">
                عملاً تم تسليمه
                <br />
                خلال الشهر
              </span>
            </div>
            <p className="mt-auto pt-[3cqi] text-[3cqi] text-[#94a8d5]">
              المحتوى · التصميم · الإنتاج
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-xs text-[var(--soft)]">
          غلاف، إحصائيات، جهات، سجل أعمال
        </span>
        <ActionButton
          onClick={() => setPreview(true)}
          className="min-h-9 px-3 text-xs"
        >
          معاينة
          <Icon name="arrow" className="size-3.5" />
        </ActionButton>
      </div>
    </section>
  );
}

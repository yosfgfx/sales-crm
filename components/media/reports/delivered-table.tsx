"use client";

import { WORK_TYPE_LABELS, type MediaData } from "@/data/media";
import { shortReportDate, type monthlyReport } from "@/lib/media-exports";
import { CompanyLogo } from "../company-logo";
import { Channels, EmptyState, countText } from "../ui";

export function DeliveredTable({
  report,
  data,
  onOpenIdea,
}: {
  report: ReturnType<typeof monthlyReport>;
  data: MediaData;
  onOpenIdea: (id: string) => void;
}) {
  return (
    <section className="media-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div>
          <h3 className="font-semibold">سجل الأعمال المسلّمة</h3>
          <p className="mt-1 text-xs text-[var(--soft)]">
            التفاصيل الكاملة للرجوع إليها في أي وقت.
          </p>
        </div>
        <span className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--soft)]">
          {countText(report.count, "work")}
        </span>
      </div>
      {report.count ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-right text-sm">
            <thead className="bg-[var(--background)] text-xs font-normal text-[var(--soft)]">
              <tr>
                {[
                  "العمل",
                  "الجهة المستفيدة",
                  "إدارة الطلب",
                  "نوع العمل",
                  "تاريخ الطلب",
                  "تاريخ التسليم",
                  "قنوات النشر",
                ].map((label) => (
                  <th key={label} className="px-5 py-3 font-normal">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.ideas.map((idea) => (
                <tr
                  key={idea.id}
                  className="border-t border-[var(--border)] transition-colors hover:bg-[#fafbfe]"
                >
                  <td className="px-5 py-4">
                    <button
                      onClick={() => onOpenIdea(idea.id)}
                      className="text-start font-medium text-[var(--foreground)] hover:text-[var(--primary)]"
                    >
                      <span className="block max-w-[24em]">{idea.title}</span>
                      <span
                        dir="ltr"
                        className="mt-1 block text-right text-xs font-normal text-[var(--soft)]"
                      >
                        {idea.code}
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <CompanyLogo
                      companyId={idea.companyId}
                      decorative
                      className="mb-1 h-9 w-24"
                    />
                    <span className="block text-xs">
                      {
                        data.companies.find(
                          (company) => company.id === idea.companyId,
                        )?.shortName
                      }
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-[var(--soft)]">
                    {idea.department}
                  </td>
                  <td className="px-5 py-4 text-xs">
                    {WORK_TYPE_LABELS[idea.workType]}
                  </td>
                  <td className="px-5 py-4 text-xs whitespace-nowrap text-[var(--soft)]">
                    {shortReportDate(idea.requestedAt)}
                  </td>
                  <td className="px-5 py-4 text-xs whitespace-nowrap text-[var(--soft)]">
                    {shortReportDate(idea.deliveredAt)}
                  </td>
                  <td className="px-5 py-4">
                    <Channels channels={idea.channels} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="لا توجد أعمال مسلّمة في هذا الشهر"
          description="اختر شهراً آخر، أو أكمل تسليم الأعمال ليظهر تقريرها هنا تلقائياً."
        />
      )}
    </section>
  );
}

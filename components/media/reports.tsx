"use client";

import { useMemo, useState } from "react";
import type { MediaData } from "@/data/media";
import { CompanyLogo } from "@/components/media/company-logo";
import {
  buildMonthlyReportHtml,
  exportMonthlyCsv,
  exportMonthlyXlsx,
  monthlyReport,
  previousReportMonth,
  printMonthlyReport,
  REPORT_COLORS,
  reportDate,
} from "@/lib/media-exports";
import {
  countText,
  ActionButton,
  Icon,
  Modal,
  errorText,
} from "@/components/media/ui";
import { ReportStat } from "./reports/report-stat";
import { WorkTypesSection } from "./reports/work-types-section";
import { ReportCover } from "./reports/report-cover";
import { DeliveredTable } from "./reports/delivered-table";

type Props = { data: MediaData; onOpenIdea: (id: string) => void };

export function Reports({ data, onOpenIdea }: Props) {
  const [month, setMonth] = useState(() =>
    reportDate(new Date().toISOString()).slice(0, 7),
  );
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | "csv" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const report = useMemo(() => monthlyReport(data, month), [data, month]);
  const previous = useMemo(
    () => monthlyReport(data, previousReportMonth(month)),
    [data, month],
  );
  const activeTypes = report.workTypes.filter((type) => type.count);
  const departmentMaximum = Math.max(
    ...report.departments.map((department) => department.count),
    1,
  );

  async function exportReport(kind: "pdf" | "xlsx" | "csv") {
    setError("");
    setExporting(kind);
    try {
      if (kind === "pdf") await printMonthlyReport(data, month);
      else if (kind === "xlsx") await exportMonthlyXlsx(data, month);
      else exportMonthlyCsv(data, month);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            إنجازات تُروى بالأرقام
          </h2>
          <p className="mt-1 text-sm text-[var(--soft)]">
            تقرير شهري يجمع الأعمال المسلّمة والجهات المستفيدة والمخرجات
            النهائية.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <label className="media-input flex max-w-full min-w-0 items-center gap-2 px-3 sm:w-auto">
            <Icon name="calendar" className="size-4 text-[var(--soft)]" />
            <span className="sr-only">شهر التقرير</span>
            <input
              type="month"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
              className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <ActionButton
            onClick={() => void exportReport("csv")}
            disabled={!!exporting}
          >
            <Icon name="download" className="size-4" />
            CSV
          </ActionButton>
          <ActionButton
            onClick={() => void exportReport("xlsx")}
            disabled={!!exporting}
          >
            <Icon name="download" className="size-4" />
            {exporting === "xlsx" ? "جارٍ التصدير…" : "Excel"}
          </ActionButton>
          <ActionButton
            primary
            onClick={() => void exportReport("pdf")}
            disabled={!!exporting}
          >
            <Icon name="report" className="size-4" />
            {exporting === "pdf" ? "جارٍ التجهيز…" : "حفظ PDF"}
          </ActionButton>
        </div>
        <p className="w-full text-xs text-[var(--soft)]">«حفظ PDF» يفتح نافذة الطباعة بأدق عرض للنص العربي. اختر فيها «حفظ بتنسيق PDF».</p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportStat
          label="أعمال تم تسليمها"
          value={report.count.toString()}
          icon="check"
          note={
            previous.count
              ? `${report.count >= previous.count ? "+" : ""}${report.count - previous.count} مقارنة بالشهر السابق`
              : "حسب تاريخ التسليم الفعلي"
          }
          tone="indigo"
        />
        <ReportStat
          label="نسخ نهائية مؤرشفة"
          value={report.versions.toString()}
          icon="archive"
          note="جميع ملفات المخرجات النهائية"
          tone="green"
        />
        <ReportStat
          label="إدارات مستفيدة"
          value={report.departments.length.toString()}
          icon="people"
          note={`${report.companies.length} شركات استفادت من الأعمال`}
          tone="orange"
        />
        <ReportStat
          label="الالتزام بالموعد"
          value={report.withDeadline ? `${report.onTimeRate}%` : "—"}
          icon="clock"
          note={
            report.withDeadline
              ? `${report.onTime} من ${report.withDeadline} أعمال ذات موعد`
              : "لم تسلّم أعمال ذات موعد محدد"
          }
          tone="blue"
        />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.8fr)]">
        <div className="space-y-6">
          <WorkTypesSection
            report={report}
            activeTypes={activeTypes}
          />
          <section className="media-card p-5 sm:p-6">
            <h3 className="font-semibold">الأعمال حسب الشركة</h3>
            <p className="mt-1 text-sm text-[var(--soft)]">
              الجهات التي استفادت من الأعمال المسلّمة خلال الشهر.
            </p>
            <div className="mt-5 space-y-4">
              {report.companies.length ? (
                report.companies.map((company) => (
                  <div key={company.id} className="flex items-center gap-3">
                    <CompanyLogo
                      companyId={company.id}
                      decorative
                      className="h-11 w-28 border border-[var(--border)]"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm">{company.name}</span>
                      <span className="mt-1 block text-xs text-[var(--soft)]">
                        {Math.round((company.count / report.count) * 100)}% من
                        أعمال الشهر
                      </span>
                    </div>
                    <b className="text-lg tabular-nums">{company.count}</b>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--soft)]">
                  لم يتم تسليم أعمال خلال الشهر.
                </p>
              )}
            </div>
          </section>
          <section className="media-card p-5 sm:p-6">
            <h3 className="font-semibold">الأعمال حسب الإدارة المستفيدة</h3>
            <p className="mt-1 text-sm text-[var(--soft)]">
              جهة الطلب داخل الشركة ومتوسط مدة الإنجاز.
            </p>
            <div className="mt-6 space-y-5">
              {report.departments.length ? (
                report.departments.map((department, index) => (
                  <div key={department.name}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span>{department.name}</span>
                      <span className="text-xs text-[var(--soft)]">
                        {countText(department.count, "work")} ·{" "}
                        {department.averageDays === 0
                          ? "نفس اليوم"
                          : `${department.averageDays.toFixed(1)} يوم`}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#eef0f5]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(department.count / departmentMaximum) * 100}%`,
                          background:
                            REPORT_COLORS[index % REPORT_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--soft)]">
                  لم يتم تسليم أعمال خلال الشهر.
                </p>
              )}
            </div>
          </section>
        </div>
        <div className="space-y-6">
          <ReportCover data={data} report={report} setPreview={setPreview} />
          <section className="media-card p-5">
            <h3 className="font-semibold">قنوات النشر</h3>
            <div className="mt-4 space-y-3">
              {report.channels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--background)] text-[var(--soft)]">
                    <Icon
                      name={
                        channel.id === "screens"
                          ? "screen"
                          : (channel.id as "whatsapp" | "email")
                      }
                      className="size-4"
                    />
                  </span>
                  <span className="flex-1 text-sm">{channel.label}</span>
                  <b className="text-sm tabular-nums">{channel.count}</b>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-6 text-[var(--soft)]">
              قد يظهر العمل في عدة قنوات. تحسب إحصائيات الأعمال كل طلب مرة
              واحدة.
            </p>
          </section>
        </div>
      </div>
      <DeliveredTable report={report} data={data} onOpenIdea={onOpenIdea} />
      <p className="text-xs leading-6 text-[var(--soft)]">
        يعتمد التقرير على تاريخ التسليم الفعلي بتوقيت الرياض. يحتفظ ملف Excel
        بالتواريخ كقيم قابلة للفرز، ويضم ملخص الشهر وسجل الأعمال وعروض الأسعار.
      </p>
      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title={`التقرير الشهري · ${report.label}`}
        description="معاينة التقرير بتنسيق A4 العمودي قبل حفظه أو إرساله."
        wide
      >
        <div className="flex justify-end border-b border-[var(--border)] px-5 py-3">
          <ActionButton
            primary
            onClick={() => void exportReport("pdf")}
            disabled={!!exporting}
          >
            <Icon name="download" className="size-4" />
            حفظ PDF / طباعة
          </ActionButton>
        </div>
        {error && (
          <p
            role="alert"
            className="mx-5 my-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <iframe
          title={`معاينة تقرير ${report.label}`}
          srcDoc={buildMonthlyReportHtml(data, month)}
          className="h-[68dvh] w-full border-0 bg-[#eef0f6]"
        />
      </Modal>
    </div>
  );
}

export default Reports;

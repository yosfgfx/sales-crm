"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { MediaData } from "@/data/media";
import { WORK_TYPE_LABELS } from "@/data/media";
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
  shortReportDate,
} from "@/lib/media-exports";
import {
  ActionButton,
  Channels,
  EmptyState,
  Icon,
  Modal,
  errorText,
} from "@/components/media/ui";

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
  let angle = 0;
  const gradient = activeTypes
    .map((type) => {
      const start = angle;
      angle += (type.count / Math.max(report.count, 1)) * 360;
      return `${type.color} ${start}deg ${angle}deg`;
    })
    .join(", ");

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
          <section className="media-card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">توزيع أنواع الأعمال</h3>
                <p className="mt-1 text-sm text-[var(--soft)]">
                  ما الذي أنجزه الفريق في {report.label}؟
                </p>
              </div>
              <span className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs text-[var(--primary)]">
                {report.label}
              </span>
            </div>
            <div className="mt-6 flex flex-col items-center gap-7 sm:flex-row">
              <div
                role="img"
                aria-label={
                  activeTypes
                    .map((type) => `${type.label}: ${type.count}`)
                    .join("، ") || "لا توجد أعمال"
                }
                className="relative flex size-44 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: report.count
                    ? `conic-gradient(${gradient})`
                    : "#eef0f5",
                }}
              >
                <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-3xl font-semibold tabular-nums">
                    {report.count}
                  </span>
                  <span className="mt-1 text-xs text-[var(--soft)]">
                    عمل مسلّم
                  </span>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-x-5 gap-y-4">
                {report.workTypes.map((type) => (
                  <div key={type.id} className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: type.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs text-[var(--soft)]">
                        {type.label}
                      </span>
                      <span className="text-lg font-semibold tabular-nums">
                        {type.count}
                      </span>
                      <span className="ms-2 text-xs text-[var(--soft)]">
                        {report.count
                          ? Math.round((type.count / report.count) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-5">
              <div className="rounded-xl bg-[#f5f8fb] px-4 py-3">
                <span className="text-xs text-[var(--soft)]">
                  متوسط الإنجاز
                </span>
                <strong className="mt-1 block text-xl tabular-nums">
                  {report.averageDays.toFixed(1)}{" "}
                  <span className="text-xs font-normal">يوم</span>
                </strong>
              </div>
              <div className="rounded-xl bg-[#eef7f1] px-4 py-3">
                <span className="text-xs text-[var(--soft)]">
                  التسليم في نفس اليوم
                </span>
                <strong className="mt-1 block text-xl text-[#248466] tabular-nums">
                  {report.sameDayRate}%{" "}
                  <span className="text-xs font-normal">من الأعمال</span>
                </strong>
              </div>
            </div>
          </section>
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
                        {department.count} أعمال ·{" "}
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
                      <Image
                        unoptimized
                        src={data.settings.logoUrl}
                        width={180}
                        height={40}
                        alt={data.settings.departmentName}
                        className="h-[12cqi] max-w-full object-contain"
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
      <section className="media-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h3 className="font-semibold">سجل الأعمال المسلّمة</h3>
            <p className="mt-1 text-xs text-[var(--soft)]">
              التفاصيل الكاملة للرجوع إليها في أي وقت.
            </p>
          </div>
          <span className="rounded-lg bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--soft)]">
            {report.count} أعمال
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
                          className="mt-1 block text-right text-[10px] font-normal text-[var(--soft)]"
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

function ReportStat({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: "check" | "archive" | "people" | "clock";
  tone: "indigo" | "green" | "orange" | "blue";
}) {
  const colors = {
    indigo: "bg-[#efedfc] text-[#665cce]",
    green: "bg-[#ecf5ef] text-[#4a9b78]",
    orange: "bg-[#faf0e8] text-[#cb8a5b]",
    blue: "bg-[#eaf2fc] text-[#6494ca]",
  };
  return (
    <div className="media-card px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--soft)]">{label}</span>
        <span
          className={`flex size-9 items-center justify-center rounded-xl ${colors[tone]}`}
        >
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <strong className="mt-3 block text-[31px] leading-none font-semibold tabular-nums">
        {value}
      </strong>
      <p className="mt-3 text-xs text-[var(--soft)]">{note}</p>
    </div>
  );
}

export default Reports;

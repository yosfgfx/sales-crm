import {
  CHANNEL_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  WORK_TYPE_LABELS,
  ideaCompanyLabel,
  ideaHasCompany,
  type Attachment,
  type Idea,
  type MediaData,
} from "@/data/media";
import type PptxGenJS from "pptxgenjs";
import { companyBrand } from "@/lib/company-branding";
import { fetchAttachment } from "@/lib/download-client";

export const REPORT_COLORS = [
  "#5146d8",
  "#22a78b",
  "#7695ea",
  "#e8ac55",
  "#af80cf",
  "#93b6b4",
];

/** Calendar dates and reporting boundaries follow the team's Riyadh timezone. */
export function reportDate(value?: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    date,
  );
}

export function reportMonthLabel(month: string): string {
  const date = new Date(`${month}-01T12:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? month
    : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Riyadh",
      }).format(date);
}

export function shortReportDate(value?: string): string {
  const date = reportDate(value);
  return date
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        day: "numeric",
        month: "short",
        timeZone: "Asia/Riyadh",
      }).format(new Date(`${date}T12:00:00Z`))
    : "—";
}

function dateDays(value?: string): number | undefined {
  const date = reportDate(value);
  return date ? Date.parse(`${date}T00:00:00Z`) / 86_400_000 : undefined;
}

export function turnaroundDays(idea: Idea): number | undefined {
  const requested = dateDays(idea.requestedAt);
  const delivered = dateDays(idea.deliveredAt);
  return requested !== undefined && delivered !== undefined
    ? Math.max(0, delivered - requested)
    : undefined;
}

export function monthlyReport(data: MediaData, month: string) {
  const ideas = data.ideas
    .filter(
      (idea) =>
        !idea.deletedAt &&
        idea.status === "delivered" &&
        reportDate(idea.deliveredAt).slice(0, 7) === month,
    )
    .sort((a, b) => (a.deliveredAt || "").localeCompare(b.deliveredAt || ""));
  const durations = ideas
    .map(turnaroundDays)
    .filter((value): value is number => value !== undefined);
  const count = ideas.length;
  const versions = ideas.reduce(
    (sum, idea) =>
      sum + idea.attachments.filter((file) => file.kind === "final").length,
    0,
  );
  const sameDay = ideas.filter((idea) => turnaroundDays(idea) === 0).length;
  const onTime = ideas.filter(
    (idea) =>
      idea.dueDate && reportDate(idea.deliveredAt) <= reportDate(idea.dueDate),
  ).length;
  const withDeadline = ideas.filter((idea) => !!idea.dueDate).length;
  const averageDays = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : 0;
  const workTypes = Object.entries(WORK_TYPE_LABELS).map(
    ([id, label], index) => ({
      id,
      label,
      count: ideas.filter((idea) => idea.workType === id).length,
      color: REPORT_COLORS[index % REPORT_COLORS.length],
    }),
  );
  const companies = data.companies
    .map((company) => ({
      ...company,
      count: ideas.filter((idea) => ideaHasCompany(idea, company.id)).length,
    }))
    .filter((company) => company.count)
    .sort((a, b) => b.count - a.count);
  const departments = [...new Set(ideas.map((idea) => idea.department))]
    .map((name) => {
      const requests = ideas.filter((idea) => idea.department === name);
      const times = requests
        .map(turnaroundDays)
        .filter((value): value is number => value !== undefined);
      return {
        name,
        count: requests.length,
        averageDays: times.length
          ? times.reduce((sum, value) => sum + value, 0) / times.length
          : 0,
        workTypes: workTypes.map((type) => ({
          ...type,
          count: requests.filter((idea) => idea.workType === type.id).length,
        })),
      };
    })
    .sort((a, b) => b.count - a.count);
  const channels = Object.entries(CHANNEL_LABELS).map(([id, label]) => ({
    id,
    label,
    count: ideas.filter((idea) =>
      idea.channels.includes(id as Idea["channels"][number]),
    ).length,
  }));
  const categories = data.categories.map((category) => ({
    ...category,
    count: ideas.filter((idea) => idea.categoryId === category.id).length,
  }));
  const previews = ideas.flatMap((idea) =>
    idea.attachments
      .filter((file) => file.kind === "final" && file.mime.startsWith("image/"))
      .map((file) => ({ idea, file })),
  );
  return {
    month,
    label: reportMonthLabel(month),
    ideas,
    count,
    versions,
    sameDay,
    sameDayRate: count ? Math.round((sameDay / count) * 100) : 0,
    onTime,
    withDeadline,
    onTimeRate: withDeadline ? Math.round((onTime / withDeadline) * 100) : 0,
    averageDays,
    workTypes,
    companies,
    departments,
    channels,
    categories,
    previews,
  };
}

export function previousReportMonth(month: string) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function safeAssetUrl(value?: string): string {
  if (!value) return "";
  if (
    /^(?:https?:\/\/|\/[^/]|data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);)/i.test(
      value,
    )
  )
    return value;
  return "";
}

function htmlLogo(data: MediaData) {
  const logo = safeAssetUrl(data.settings.logoUrl);
  return logo
    ? `<img class="department-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(data.settings.departmentName)}" />`
    : `<strong class="logo-text">${escapeHtml(data.settings.departmentName)}</strong>`;
}

function htmlCompanyLogo(companyId: string, className = "company-logo") {
  const brand = companyBrand(companyId);
  return brand
    ? `<img class="${className}" src="${escapeHtml(brand.logoUrl)}" alt="" />`
    : "";
}

/** Separate, escaped document: browser print produces an actual portrait A4 PDF. */
export function buildMonthlyReportHtml(data: MediaData, month: string): string {
  const report = monthlyReport(data, month);
  const department = escapeHtml(data.settings.departmentName);
  const header = `<header>${htmlLogo(data)}<div>تقرير الأعمال الشهري<br><strong>${escapeHtml(report.label)}</strong></div></header>`;
  const footer = `<footer><span>${department}</span><span>${escapeHtml(report.label)}</span></footer>`;
  const bars = (
    items: { name?: string; label?: string; count: number; color?: string }[],
  ) =>
    items
      .map(
        (item, index) =>
          `<div class="bar-row"><span>${escapeHtml(item.name || item.label)}</span><div class="track"><i style="width:${report.count ? (item.count / report.count) * 100 : 0}%;background:${REPORT_COLORS[index % REPORT_COLORS.length]}"></i></div><b>${item.count}</b></div>`,
      )
      .join("");
  const listRows = report.ideas
    .map(
      (idea, index) =>
        `<tr><td>${index + 1}</td><td><b>${escapeHtml(idea.title)}</b><small>${escapeHtml(idea.code)}</small></td><td>${htmlCompanyLogo(idea.companyId, "register-company-logo")}<span>${escapeHtml(ideaCompanyLabel(idea, data.companies, true))}</span></td><td>${escapeHtml(idea.department)}</td><td>${escapeHtml(WORK_TYPE_LABELS[idea.workType])}</td><td>${escapeHtml(shortReportDate(idea.requestedAt))}</td><td>${escapeHtml(shortReportDate(idea.deliveredAt))}</td><td>${escapeHtml(idea.channels.map((channel) => CHANNEL_LABELS[channel]).join("، "))}</td><td>${idea.attachments.filter((file) => file.kind === "final").length}</td></tr>`,
    )
    .join("");
  const companyBars = report.companies
    .map(
      (company, index) =>
        `<div class="bar-row company-bar"><div>${htmlCompanyLogo(company.id)}<span>${escapeHtml(company.name)}</span></div><div class="track"><i style="width:${report.count ? (company.count / report.count) * 100 : 0}%;background:${REPORT_COLORS[index % REPORT_COLORS.length]}"></i></div><b>${company.count}</b></div>`,
    )
    .join("");
  const departmentalRows = report.departments
    .map(
      (item) =>
        `<tr><td><b>${escapeHtml(item.name)}</b></td>${item.workTypes.map((type) => `<td>${type.count || "—"}</td>`).join("")}<td><b>${item.count}</b></td><td>${item.averageDays === 0 ? "نفس اليوم" : `${item.averageDays.toFixed(1)} يوم`}</td></tr>`,
    )
    .join("");
  const cover = `<section class="cover"><div class="cover-brand">${htmlLogo(data)}</div><div class="cover-body"><p class="eyebrow">التقرير الشهري</p><h1>أعمال فريق<br>التواصل الداخلي</h1><p class="cover-department">${department}</p><div class="month">${escapeHtml(report.label)}</div><div class="cover-count"><b>${report.count}</b><span>عمل تم تسليمه خلال الشهر</span></div></div><div class="cover-bottom">المحتوى · التصميم · الإنتاج</div></section>`;
  const summary = `<section class="report-page">${header}<h1><span>01</span> إنجازات الشهر</h1><p class="intro">الأعمال التي اكتمل تسليمها في ${escapeHtml(report.label)}، محسوبة حسب تاريخ التسليم الفعلي.</p><div class="kpis"><article class="navy"><span>الأعمال المسلّمة</span><b>${report.count}</b><small>عمل مكتمل</small></article><article class="mint"><span>التسليم في نفس اليوم</span><b>${report.sameDayRate}%</b><small>${report.sameDay} عمل من إجمالي ${report.count}</small></article><article><span>الإدارات المستفيدة</span><b>${report.departments.length}</b><small>إدارة وجهة طلب</small></article><article><span>النسخ النهائية المؤرشفة</span><b>${report.versions}</b><small>ملف نهائي مرفق</small></article></div><h2>الأعمال حسب نوع الإنتاج</h2><div class="chart-box">${bars(report.workTypes.filter((type) => type.count)) || "<p>لا توجد أعمال مسلّمة في هذا الشهر.</p>"}</div><h2>مؤشرات التسليم</h2><div class="highlight"><span>متوسط المدة من الطلب إلى التسليم</span><b>${report.averageDays.toFixed(1)} يوم</b></div><div class="highlight"><span>الالتزام بالموعد المحدد</span><b>${report.withDeadline ? `${report.onTimeRate}% (${report.onTime} من ${report.withDeadline})` : "لا توجد مواعيد محددة"}</b></div><p class="note">كل سجل يمثّل عملاً واحداً. النسخ النهائية هي عدد الملفات النهائية المرفقة. مدد الإنجاز تقاس بالأيام التقويمية بتوقيت الرياض.</p>${footer}</section>`;
  const breakdown = `<section class="report-page">${header}<h1><span>02</span> الجهات المستفيدة</h1><p class="intro">توزيع الأعمال على الشركات والإدارات، مع متوسط المدة من تاريخ الطلب إلى التسليم.</p><h2>الأعمال حسب الشركة</h2><div class="chart-box">${companyBars || "<p>لا توجد أعمال خلال الشهر.</p>"}</div><h2>طلبات الإدارات</h2><table class="department-table"><thead><tr><th>الإدارة</th>${report.workTypes.map((type) => `<th>${escapeHtml(type.label)}</th>`).join("")}<th>الإجمالي</th><th>متوسط الإنجاز</th></tr></thead><tbody>${departmentalRows || `<tr><td colspan="9">لا توجد طلبات مسلّمة.</td></tr>`}</tbody></table><h2>قنوات النشر</h2><div class="channels">${report.channels.map((channel) => `<article><b>${channel.count}</b><span>${escapeHtml(channel.label)}</span></article>`).join("")}</div><p class="note">يمكن نشر العمل نفسه في أكثر من قناة، لذلك قد يتجاوز مجموع القنوات عدد الأعمال.</p>${footer}</section>`;
  const previews = report.previews.length
    ? `<section class="report-page">${header}<h1><span>03</span> نماذج من الأعمال</h1><p class="intro">معاينات الملفات النهائية المسلّمة والمؤرشفة خلال الشهر.</p><div class="gallery">${report.previews
        .slice(0, 6)
        .map(
          ({ idea, file }) =>
            `<figure><img src="${escapeHtml(safeAssetUrl(file.url))}" alt="${escapeHtml(idea.title)}" /><figcaption><b>${escapeHtml(idea.title)}</b><small>${escapeHtml(file.name)} · ${escapeHtml(shortReportDate(idea.deliveredAt))}</small></figcaption></figure>`,
        )
        .join("")}</div>${footer}</section>`
    : "";
  const register = `<section class="register report-page">${header}<h1><span>${previews ? "04" : "03"}</span> سجل الأعمال المسلّمة</h1><p class="intro">بيانات جميع الأعمال التي تم تسليمها خلال ${escapeHtml(report.label)}.</p><table class="register-table"><thead><tr><th>#</th><th>العمل</th><th>الشركة</th><th>إدارة الطلب</th><th>النوع</th><th>الطلب</th><th>التسليم</th><th>القنوات</th><th>النسخ</th></tr></thead><tbody>${listRows || `<tr><td colspan="9">لا توجد أعمال مسلّمة في الشهر المحدد.</td></tr>`}</tbody><tfoot><tr><td colspan="8">الإجمالي: ${report.count} عمل</td><td>${report.versions}</td></tr></tfoot></table>${footer}</section>`;
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>تقرير أعمال التواصل الداخلي - ${escapeHtml(report.label)}</title><style>
  @font-face{font-family:Thmanyah;src:url('${typeof window === "undefined" ? "" : window.location.origin}/fonts/thmanyah/thmanyah-sans-regular.woff2')}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#15234c;font-family:Thmanyah,Tahoma,Arial,sans-serif;font-size:11px;line-height:1.6} @page{size:A4 portrait;margin:14mm 12mm}section{position:relative;break-after:page}.report-page{min-height:267mm;padding-bottom:14mm}.cover{height:267mm;padding:14mm;background:#14214c;color:#fff;overflow:hidden}.cover:after{content:"";position:absolute;width:180mm;height:180mm;border:1px solid #415574;border-radius:50%;left:-85mm;bottom:-45mm}.cover-brand{position:relative;z-index:1;background:#fff;width:max-content;max-width:100%;padding:5mm;border-radius:3mm}.cover-body{margin-top:35mm;position:relative;z-index:1}.eyebrow{font-size:18px;color:#bdc9f7}h1{font-size:23px;margin:6mm 0 2mm;line-height:1.4}.cover h1{font-size:40px;line-height:1.5;max-width:150mm}.cover-department{font-size:15px;color:#d0d8ed}.month{display:inline-block;padding:2mm 7mm;background:#5146d8;border-radius:8mm;font-size:18px;margin-top:6mm}.cover-count{display:flex;align-items:center;gap:6mm;margin-top:20mm}.cover-count b{font-size:54px}.cover-count span{font-size:14px}.cover-bottom{position:absolute;bottom:16mm;color:#c7d3e9;font-size:12px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e3e8f1;padding-bottom:4mm;margin-bottom:7mm;font-size:10px;color:#73819d}.department-logo{width:46mm;height:16mm;object-fit:contain;object-position:right center}header>div{text-align:left}h1 span{font-size:12px;background:#172d6b;color:white;padding:2mm;border-radius:50%;margin-left:2mm}h2{font-size:15px;margin:7mm 0 3mm}.intro{color:#73819d;margin-bottom:7mm}.kpis{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.kpis article{border:1px solid #dce4eb;border-radius:6mm;padding:5mm;text-align:center}.kpis article b{display:block;font-size:36px;line-height:1.3}.kpis article small{color:#7b89a0}.kpis .navy{background:#192f70;color:#fff;border-color:#192f70}.kpis .navy small{color:#dce4fc}.kpis .mint{background:#e4f2e9;color:#086752;border-color:#e4f2e9}.chart-box{background:#f5f8fb;padding:5mm;border-radius:5mm}.bar-row{display:grid;grid-template-columns:42mm 1fr 8mm;gap:4mm;align-items:center;margin:3mm 0}.track{height:3mm;background:#e9eef7;border-radius:4mm;overflow:hidden}.track i{display:block;height:100%;border-radius:4mm}.highlight{padding:3mm 4mm;background:#f5f8fb;border-radius:3mm;margin-bottom:2mm;display:flex;justify-content:space-between;gap:4mm}.note{font-size:9px;color:#73819d;margin-top:5mm}footer{position:absolute;bottom:0;right:0;left:0;border-top:1px solid #e3e8f1;padding-top:3mm;display:flex;justify-content:space-between;color:#8994a9;font-size:9px}table{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed}th{background:#19316f;color:#fff;text-align:right;padding:3mm 1.5mm;font-weight:500}td{padding:3mm 1.5mm;border-bottom:1px solid #e7eef2;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f5f9fb}thead{display:table-header-group}tr,figure{break-inside:avoid}tfoot td{font-weight:bold;background:#eaf1f5}.department-table th:first-child{width:36mm}.department-table th:last-child{width:20mm}.department-table td:not(:first-child){text-align:center}.channels{display:flex;gap:4mm}.channels article{flex:1;background:#eef3f9;border-radius:4mm;padding:4mm;text-align:center}.channels b{display:block;font-size:25px}.register-table th:nth-child(1){width:7mm}.register-table th:nth-child(2){width:37mm}.register-table th:nth-child(3){width:23mm}.register-table th:nth-child(4){width:26mm}.register-table th:nth-child(5){width:20mm}.register-table th:nth-child(6),.register-table th:nth-child(7){width:17mm}.register-table th:nth-child(8){width:22mm}.register-table th:nth-child(9){width:8mm}.register{min-height:267mm}.register td small{display:block;color:#8d98a8;font-size:8px;direction:ltr;text-align:right}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.gallery figure{margin:0;background:#f6f8fb;border-radius:3mm;overflow:hidden}.gallery img{display:block;width:100%;height:50mm;object-fit:contain;background:#f0f3f7}.gallery figcaption{padding:3mm}.gallery figcaption small{display:block;color:#7d899f} @media screen{body{max-width:210mm;margin:auto}section{margin-bottom:10mm;box-shadow:0 0 0 1px #e5e7eb}.report-page{padding:12mm}}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.register footer{position:static;margin-top:8mm}.register{min-height:auto}section:last-child{break-after:auto}}
  .company-logo{display:block;width:35mm;height:10mm;object-fit:contain;object-position:right center;background:#fff;padding:1mm;border-radius:1mm;margin-bottom:1mm}.company-bar>div:first-child>span{display:block;font-size:9px}.company-bar{margin:4mm 0}.register-company-logo{display:block;width:20mm;height:6mm;object-fit:contain;object-position:right center;background:#fff;padding:.5mm;margin-bottom:1mm}tfoot{display:table-row-group}@page{@bottom-left{content:counter(page) " / " counter(pages);font:9px Tahoma,sans-serif;color:#8994a9;direction:ltr}}
  </style></head><body>${cover}${summary}${breakdown}${previews}${register}</body></html>`;
}

export async function printMonthlyReport(
  data: MediaData,
  month: string,
): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title = "معاينة التقرير الشهري للطباعة";
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;right:-9999px;bottom:0;border:0;";
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error("تعذر تجهيز التقرير للطباعة."));
      frame.srcdoc = buildMonthlyReportHtml(data, month);
    });
    const document = frame.contentDocument;
    const view = frame.contentWindow;
    if (!document || !view) throw new Error("تعذر فتح معاينة التقرير.");
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.onload = () => resolve();
              image.onerror = () => resolve();
            }),
      ),
    );
    view.addEventListener("afterprint", () => frame.remove(), { once: true });
    view.focus();
    view.print();
    // Safari may omit afterprint. Keep the frame alive while the print dialog is open.
    window.setTimeout(() => frame.remove(), 120_000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}

const spreadsheetText = (value: string) =>
  /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
const REPORT_HEADERS = [
  "رمز العمل",
  "عنوان العمل",
  "الشركة",
  "إدارة الطلب",
  "نوع العمل",
  "التصنيف",
  "تاريخ الطلب",
  "موعد التسليم",
  "تاريخ التسليم الفعلي",
  "المدة بالأيام",
  "قنوات النشر",
  "مسؤول المحتوى",
  "المصمم",
  "النسخ النهائية",
  "وصف الفكرة",
  "نص المحتوى",
  "خطة التنفيذ",
  "المرفقات",
];

function reportRows(data: MediaData, month: string): (string | number)[][] {
  return monthlyReport(data, month).ideas.map((idea) => [
    idea.code,
    idea.title,
    ideaCompanyLabel(idea, data.companies),
    idea.department,
    WORK_TYPE_LABELS[idea.workType],
    data.categories.find((category) => category.id === idea.categoryId)?.name ||
      "",
    reportDate(idea.requestedAt),
    reportDate(idea.dueDate),
    reportDate(idea.deliveredAt),
    turnaroundDays(idea) ?? "",
    idea.channels.map((channel) => CHANNEL_LABELS[channel]).join("، "),
    data.members.find((member) => member.id === idea.ownerId)?.name || "",
    data.members.find((member) => member.id === idea.designerId)?.name || "",
    idea.attachments.filter((file) => file.kind === "final").length,
    idea.description,
    idea.content,
    idea.executionPlan,
    idea.attachments.map((file) => file.name).join("، "),
  ]);
}

export function buildMonthlyCsv(data: MediaData, month: string): string {
  return (
    "\uFEFF" +
    [REPORT_HEADERS, ...reportRows(data, month)]
      .map((row) =>
        row
          .map(
            (cell) => `"${spreadsheetText(String(cell)).replace(/"/g, '""')}"`,
          )
          .join(","),
      )
      .join("\r\n")
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportMonthlyCsv(data: MediaData, month: string) {
  downloadBlob(
    new Blob([buildMonthlyCsv(data, month)], {
      type: "text/csv;charset=utf-8",
    }),
    `تقرير-التواصل-الداخلي-${month}.csv`,
  );
}

export async function createMonthlyWorkbook(
  data: MediaData,
  month: string,
): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.settings.departmentName;
  workbook.subject = `الأعمال المسلّمة خلال ${reportMonthLabel(month)}`;
  workbook.created = new Date();
  const report = monthlyReport(data, month);
  const summary = workbook.addWorksheet("ملخص الشهر", {
    views: [{ rightToLeft: true }],
  });
  summary.columns = [{ width: 40 }, { width: 24 }];
  summary.addRows([
    [data.settings.departmentName, report.label],
    ["المؤشر", "القيمة"],
    ["الأعمال المسلّمة", report.count],
    ["النسخ النهائية المؤرشفة", report.versions],
    ["الإدارات المستفيدة", report.departments.length],
    ["الشركات المستفيدة", report.companies.length],
    ["الأعمال المسلّمة في نفس اليوم", report.sameDay],
    [
      "نسبة التسليم في نفس اليوم",
      report.count ? report.sameDay / report.count : 0,
    ],
    ["متوسط مدة الإنجاز بالأيام", report.averageDays],
    ["الأعمال المسلّمة ضمن الموعد", report.onTime],
    ["الأعمال ذات الموعد المحدد", report.withDeadline],
    [],
    ["نوع العمل", "العدد"],
    ...report.workTypes.map((type) => [type.label, type.count]),
    [],
    ["الشركة المستفيدة", "العدد"],
    ...report.companies.map((company) => [
      company.name,
      company.count,
    ]),
    [],
    ["إدارة الطلب", "العدد"],
    ...report.departments.map((department) => [
      department.name,
      department.count,
    ]),
    [],
    ["قناة النشر", "عدد الأعمال"],
    ...report.channels.map((channel) => [channel.label, channel.count]),
  ]);
  summary.getCell("B8").numFmt = "0%";
  summary.getCell("B9").numFmt = "0.0";
  summary.getCell("A1").font = {
    name: "Tahoma",
    size: 15,
    bold: true,
    color: { argb: "FF192F70" },
  };
  const register = workbook.addWorksheet("الأعمال المسلّمة", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  register.columns = REPORT_HEADERS.map((header, index) => ({
    header,
    width: index === 1 ? 42 : index >= 14 ? 55 : index === 3 ? 30 : 22,
  }));
  for (const values of reportRows(data, month)) {
    const row = register.addRow(
      values.map((value) =>
        value,
      ),
    );
    for (const column of [7, 8, 9]) {
      const date = values[column - 1];
      if (typeof date === "string" && date) {
        row.getCell(column).value = new Date(`${date}T12:00:00Z`);
        row.getCell(column).numFmt = "yyyy-mm-dd";
      }
    }
  }
  register.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, register.rowCount), column: REPORT_HEADERS.length },
  };
  const quotes = workbook.addWorksheet("عروض الأسعار", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  quotes.columns = [
    { header: "رمز العمل", width: 18 },
    { header: "عنوان العمل", width: 42 },
    { header: "المورّد", width: 30 },
    { header: "المبلغ بالريال", width: 22 },
    { header: "المدة بالأيام", width: 18 },
    { header: "نطاق التنفيذ", width: 65 },
    { header: "العرض الموصى به", width: 24 },
    { header: "ملف عرض السعر", width: 45 },
  ];
  for (const idea of report.ideas)
    for (const quotation of idea.quotations)
      quotes.addRow(
        [
          idea.code,
          idea.title,
          quotation.vendor,
          quotation.amount,
          quotation.days,
          quotation.scope,
          quotation.recommended ? "نعم" : "لا",
          idea.attachments.find((file) => file.id === quotation.attachmentId)
            ?.name || "",
        ].map((value) =>
          value,
        ),
      );
  quotes.getColumn(4).numFmt = '#,##0.00 "ر.س"';
  for (const sheet of [summary, register, quotes]) {
    sheet.pageSetup = {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:1",
    };
    sheet.eachRow((row, rowNumber) => {
      let lineCount = 1;
      row.eachCell((cell, column) => {
        if (typeof cell.value === "string")
          lineCount = Math.max(
            lineCount,
            cell.value
              .split("\n")
              .reduce(
                (lines, line) =>
                  lines +
                  Math.max(
                    1,
                    Math.ceil(
                      line.length /
                        Math.max(
                          12,
                          (Number(sheet.getColumn(column).width) || 22) * 0.85,
                        ),
                    ),
                  ),
                0,
              ),
          );
      });
      row.height =
        rowNumber === 1 ? 32 : Math.min(409, Math.max(30, lineCount * 15 + 8));
      row.eachCell((cell) => {
        if (!(sheet === summary && rowNumber === 1))
          cell.font = { name: "Tahoma", size: 11, color: { argb: "FF21304B" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: "right",
          wrapText: true,
        };
        cell.border = {
          bottom: { style: "hair", color: { argb: "FFE5EAF0" } },
        };
        if (rowNumber === (sheet === summary ? 2 : 1)) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF192F70" },
          };
          cell.font = {
            name: "Tahoma",
            size: 11,
            bold: true,
            color: { argb: "FFFFFFFF" },
          };
        } else if (rowNumber % 2 === 0)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF4F7FB" },
          };
      });
    });
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export async function exportMonthlyXlsx(data: MediaData, month: string) {
  const bytes = await createMonthlyWorkbook(data, month);
  downloadBlob(
    new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `تقرير-التواصل-الداخلي-${month}.xlsx`,
  );
}

export type ApprovalSlide = {
  title: string;
  kind: "cover" | "text" | "quote" | "attachment";
  paragraphs: string[];
  attachment?: Attachment;
};

const HISTORY_LABELS: Record<Idea["history"][number]["action"], string> = {
  created: "إنشاء الفكرة",
  edited: "تعديل الفكرة",
  submitted: "إرسال للاعتماد",
  changes_requested: "طلب تعديلات",
  approved: "اعتماد الفكرة",
  scheduled: "جدولة التصميم",
  design_started: "بدء التصميم",
  design_review: "المراجعة النهائية",
  delivered: "تسليم العمل",
  attachments_added: "إضافة مرفقات",
  attachment_removed: "إزالة مرفق",
  quotation_added: "إضافة عرض سعر",
  quotation_removed: "إزالة عرض سعر",
  comment: "تعليق",
  withdrawn: "سحب من الاعتماد",
  rejected: "رفض الفكرة",
  cancelled: "إلغاء الفكرة",
  reopened: "إعادة فتح العمل",
  reassigned: "إعادة إسناد",
  archived: "أرشفة في Google Drive",
  deleted: "نقل إلى سلة المحذوفات",
  restored: "استعادة العمل",
};

function splitText(value: string, limit = 650): string[] {
  if (!value.trim()) return ["لم تُضف تفاصيل بعد."];
  const result: string[] = [];
  let remaining = value;
  while (remaining.length > limit) {
    const boundary = Math.max(
      remaining.lastIndexOf("\n", limit),
      remaining.lastIndexOf(" ", limit),
    );
    const cut = boundary > limit / 2 ? boundary : limit;
    result.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) result.push(remaining);
  return result;
}

/** Deterministic, live approval presentation: every edit is reflected immediately. */
export function composeApprovalSlides(
  idea: Idea,
  data: MediaData,
): ApprovalSlide[] {
  const company = ideaCompanyLabel(idea, data.companies);
  const category =
    data.categories.find((item) => item.id === idea.categoryId)?.name || "";
  const owner =
    data.members.find((item) => item.id === idea.ownerId)?.name || "لم يحدد";
  const designer =
    data.members.find((item) => item.id === idea.designerId)?.name || "لم يحدد";
  const slides: ApprovalSlide[] = [
    {
      title: idea.title,
      kind: "cover",
      paragraphs: [
        "عرض الفكرة للاعتماد",
        company,
        `${idea.code} · ${idea.department}`,
        `${STATUS_LABELS[idea.status]} · أولوية ${PRIORITY_LABELS[idea.priority]}`,
      ],
    },
    {
      title: "بيانات الفكرة",
      kind: "text",
      paragraphs: [
        `الشركة: ${company}`,
        `إدارة الطلب: ${idea.department}`,
        `نوع العمل: ${WORK_TYPE_LABELS[idea.workType]}`,
        `التصنيف: ${category}`,
        `مسؤول المحتوى: ${owner}`,
        `المصمم: ${designer}`,
      ],
    },
    {
      title: "التواريخ والجدولة",
      kind: "text",
      paragraphs: [
        `تاريخ الطلب: ${shortReportDate(idea.requestedAt)}`,
        `موعد التسليم: ${shortReportDate(idea.dueDate)}`,
        `تاريخ الجدولة: ${shortReportDate(idea.scheduledAt)}`,
        `تاريخ التسليم الفعلي: ${shortReportDate(idea.deliveredAt)}`,
        `أُنشئت الفكرة: ${shortReportDate(idea.createdAt)}`,
        `آخر تحديث: ${shortReportDate(idea.updatedAt)}`,
      ],
    },
  ];
  if (idea.sourceProposal) {
    slides.splice(2, 0, {
      title: "مقدم الفكرة ومصدر المقترح",
      kind: "text",
      paragraphs: [
        "مقدم الفكرة: " + idea.sourceProposal.proposerName,
        "مصدر الفكرة: قائمة مقترحات التواصل الداخلي المرفقة",
        ...(idea.sourceProposal.funding
          ? ["نوع التنفيذ في المصدر: " + idea.sourceProposal.funding]
          : []),
        ...(idea.sourceProposal.sourceApproval
          ? [
              "الحالة في المصدر: " +
                idea.sourceProposal.sourceApproval +
                "؛ الاعتماد في النظام يتبع مراجعة المدير.",
            ]
          : []),
        ...(idea.sourceProposal.reviewNote
          ? [idea.sourceProposal.reviewNote]
          : []),
      ],
    });
  }
  for (const [title, text] of [
    ["الفكرة والهدف", idea.description],
    ["نص المحتوى", idea.content],
    ["خطة التنفيذ", idea.executionPlan],
  ]) {
    splitText(text).forEach((part, index) =>
      slides.push({
        title: `${title}${index ? ` - ${index + 1}` : ""}`,
        kind: "text",
        paragraphs: [part],
      }),
    );
  }
  slides.push({
    title: "قنوات النشر والمخرجات",
    kind: "text",
    paragraphs: idea.channels.map((channel) =>
      channel === "screens"
        ? "الشاشات الداخلية: نسخة أفقية بنسبة 16:9"
        : channel === "whatsapp"
          ? "واتساب: نسخة رأسية بنسبة 9:16"
          : "البريد الداخلي: تصميم مهيأ للإرسال عبر البريد الإلكتروني",
    ),
  });
  if (idea.quotations.length) {
    const comparisons = idea.quotations.map(
      (quotation) =>
        `${quotation.vendor}: ${quotation.amount.toLocaleString("ar-SA")} ر.س · ${quotation.days} يوم${quotation.recommended ? " · موصى به" : ""}`,
    );
    for (let start = 0; start < comparisons.length; start += 6)
      slides.push({
        title: `مقارنة عروض الأسعار${start ? ` - ${start / 6 + 1}` : ""}`,
        kind: "quote",
        paragraphs: comparisons.slice(start, start + 6),
      });
    idea.quotations.forEach((quotation) => {
      const file = idea.attachments.find(
        (attachment) => attachment.id === quotation.attachmentId,
      );
      splitText(quotation.scope, 450).forEach((part, index) =>
        slides.push({
          title: `عرض سعر: ${quotation.vendor}${index ? ` - ${index + 1}` : ""}`,
          kind: "quote",
          paragraphs: [
            `المبلغ: ${quotation.amount.toLocaleString("ar-SA")} ر.س`,
            `المدة: ${quotation.days} يوم`,
            `الترشيح: ${quotation.recommended ? "العرض الموصى به" : "عرض للمقارنة"}`,
            `نطاق التنفيذ: ${part}`,
            `المرفق: ${file?.name || "لم يرفق ملف"}`,
          ],
          attachment: file,
        }),
      );
    });
  } else
    slides.push({
      title: "عروض الأسعار",
      kind: "text",
      paragraphs: [
        idea.needsQuotes
          ? "الفكرة تتطلب عروض أسعار. لم تُرفق عروض بعد."
          : "تنفيذ داخلي دون عروض أسعار خارجية.",
      ],
    });
  if (idea.managerFeedback)
    splitText(idea.managerFeedback).forEach((part, index) =>
      slides.push({
        title: `ملاحظات المدير${index ? ` - ${index + 1}` : ""}`,
        kind: "text",
        paragraphs: [part],
      }),
    );
  idea.attachments.forEach((attachment) =>
    slides.push({
      title: "المرفقات والمواد المرجعية",
      kind: "attachment",
      paragraphs: [
        attachment.name,
        `النوع: ${attachment.mime || "ملف"}`,
        `الحجم: ${(attachment.size / 1024).toFixed(1)} KB`,
        `الاستخدام: ${attachment.kind === "final" ? "مخرج نهائي" : attachment.kind === "quotation" ? "عرض سعر" : "مرجع للفكرة"}`,
        ...(attachment.channel
          ? [`القناة: ${CHANNEL_LABELS[attachment.channel]}`]
          : []),
      ],
      attachment,
    }),
  );
  const history = idea.history
    .map(
      (event) =>
        `${shortReportDate(event.at)} - ${data.members.find((member) => member.id === event.actorId)?.name || "النظام"}: ${HISTORY_LABELS[event.action]}${event.note ? `\n${event.note}` : ""}`,
    )
    .join("\n\n");
  if (history)
    splitText(history).forEach((part, index) =>
      slides.push({
        title: `سجل المتابعة${index ? ` - ${index + 1}` : ""}`,
        kind: "text",
        paragraphs: [part],
      }),
    );
  slides.push({
    title: "قرار الاعتماد",
    kind: "text",
    paragraphs: [
      `الحالة الحالية: ${STATUS_LABELS[idea.status]}`,
      `الأولوية: ${PRIORITY_LABELS[idea.priority]}`,
      `تاريخ الاعتماد: ${shortReportDate(idea.approvedAt)}`,
      `النسخ المطلوبة: ${idea.channels.map((channel) => CHANNEL_LABELS[channel]).join("، ")}`,
      `عدد المرفقات: ${idea.attachments.length}`,
      `عدد عروض الأسعار: ${idea.quotations.length}`,
    ],
  });
  return slides;
}

async function imageData(url: string): Promise<string | undefined> {
  if (/^data:image\/(?:png|jpe?g|gif);base64,/i.test(url)) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    let blob = await response.blob();
    if (!blob.type.startsWith("image/")) return undefined;
    // ViewBox-only SVGs otherwise decode at the browser's default 300 × 150.
    // Give the raster copy explicit intrinsic dimensions without editing the original asset.
    if (blob.type === "image/svg+xml") {
      const svgDocument = new DOMParser().parseFromString(
        await blob.text(),
        "image/svg+xml",
      );
      const svg = svgDocument.documentElement;
      const viewBox = svg
        .getAttribute("viewBox")
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      if (
        svg.localName === "svg" &&
        viewBox?.length === 4 &&
        viewBox.every(Number.isFinite) &&
        viewBox[2] > 0 &&
        viewBox[3] > 0
      ) {
        if (!svg.getAttribute("width") || !svg.getAttribute("height")) {
          svg.setAttribute("width", String(viewBox[2]));
          svg.setAttribute("height", String(viewBox[3]));
        }
        blob = new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml",
        });
      }
    }
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      reader.readAsDataURL(blob);
    });
    if (/^image\/(?:png|jpe?g|gif)$/i.test(blob.type)) return encoded;
    // SVG/WebP and any other browser-supported images become durable PNG embeds.
    const decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      element.src = encoded;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      1600 / Math.max(decoded.naturalWidth, decoded.naturalHeight),
    );
    canvas.width = Math.max(1, Math.round(decoded.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(decoded.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

async function containedImage(
  data: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (typeof Image === "undefined") return { x, y, w: width, h: height };
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = data;
  });
  const scale = Math.min(
    width / image.naturalWidth,
    height / image.naturalHeight,
  );
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  return { x: x + (width - w) / 2, y: y + (height - h) / 2, w, h };
}

let presentationLibrary: Promise<typeof PptxGenJS> | undefined;
function loadPresentationLibrary(): Promise<typeof PptxGenJS> {
  const globals = globalThis as typeof globalThis & {
    PptxGenJS?: typeof PptxGenJS;
  };
  if (globals.PptxGenJS) return Promise.resolve(globals.PptxGenJS);
  if (typeof document === "undefined")
    return Promise.reject(new Error("تُنشأ العروض التقديمية من المتصفح."));
  if (!presentationLibrary) {
    presentationLibrary = new Promise<typeof PptxGenJS>((resolve, reject) => {
      // The official browser bundle avoids this package's Node-only ESM imports.
      const script = document.createElement("script");
      script.src = "/vendor/pptxgenjs.bundle.js";
      script.async = true;
      script.onload = () =>
        globals.PptxGenJS
          ? resolve(globals.PptxGenJS)
          : reject(new Error("تعذر تشغيل مولّد العروض التقديمية."));
      script.onerror = () =>
        reject(new Error("تعذر تحميل مولّد العروض التقديمية. أعد المحاولة."));
      document.head.appendChild(script);
    }).catch((error) => {
      presentationLibrary = undefined;
      throw error;
    });
  }
  return presentationLibrary;
}

function durableFileUrl(url: string): string | undefined {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && typeof window !== "undefined")
    return new URL(url, window.location.origin).href;
  return undefined;
}

export async function createIdeaPresentation(
  idea: Idea,
  data: MediaData,
): Promise<Uint8Array> {
  const Presentation = await loadPresentationLibrary();
  const pptx = new Presentation();
  pptx.layout = "LAYOUT_WIDE";
  pptx.rtlMode = true;
  pptx.author = data.settings.departmentName;
  pptx.subject = `عرض اعتماد الفكرة ${idea.code}`;
  pptx.title = idea.title;
  pptx.company = data.settings.departmentName;
  pptx.theme = { headFontFace: "Tahoma", bodyFontFace: "Tahoma" };
  const slides = composeApprovalSlides(idea, data);
  const logo = data.settings.logoUrl
    ? await imageData(data.settings.logoUrl)
    : undefined;
  const brand = companyBrand(idea.companyId);
  const companyLogo = brand ? await imageData(brand.logoUrl) : undefined;
  if (brand && !companyLogo)
    throw new Error(
      `تعذر تحميل شعار ${brand.name} للعرض التقديمي. أعد المحاولة.`,
    );
  for (const [index, content] of slides.entries()) {
    const slide = pptx.addSlide();
    const cover = content.kind === "cover";
    slide.background = { color: cover ? "17244D" : "F8FAFD" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.1,
      line: { color: "5146D8" },
      fill: { color: "5146D8" },
    });
    if (logo) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.55,
        y: 0.35,
        w: 2.6,
        h: 0.85,
        line: { color: "FFFFFF", transparency: 100 },
        fill: { color: "FFFFFF" },
      });
      slide.addImage({
        data: logo,
        ...(await containedImage(logo, 0.65, 0.43, 2.4, 0.67)),
        altText: data.settings.departmentName,
      });
    }
    if (companyLogo) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 10.18,
        y: 0.35,
        w: 2.6,
        h: 0.85,
        line: { color: "FFFFFF", transparency: 100 },
        fill: { color: "FFFFFF" },
      });
      slide.addImage({
        data: companyLogo,
        ...(await containedImage(companyLogo, 10.3, 0.44, 2.36, 0.67)),
        altText: `شعار ${data.companies.find((company) => company.id === idea.companyId)?.name || brand?.name}`,
      });
    }
    slide.addText(content.title, {
      x: 0.65,
      y: cover ? 2 : 1.5,
      w: 12,
      h: cover ? 1.4 : 0.65,
      fontFace: "Tahoma",
      fontSize: cover ? 34 : 26,
      bold: true,
      color: cover ? "FFFFFF" : "17244D",
      align: "right",
      rtlMode: true,
      lang: "ar-SA",
      breakLine: false,
      fit: "shrink",
      margin: 0,
    });
    const attachmentImage =
      content.kind === "attachment" &&
      content.attachment?.mime.startsWith("image/")
        ? await imageData(content.attachment.url)
        : undefined;
    slide.addText(content.paragraphs.join("\n\n"), {
      x: attachmentImage ? 7.2 : 0.75,
      y: cover ? 3.75 : 2.55,
      w: attachmentImage ? 5.4 : 11.85,
      h: cover ? 2.25 : 3.7,
      fontFace: "Tahoma",
      fontSize: cover ? 19 : 18,
      color: cover ? "CFD9F2" : "3B4864",
      align: "right",
      rtlMode: true,
      lang: "ar-SA",
      valign: "top",
      paraSpaceAfter: 8,
      fit: "shrink",
      margin: 0,
    });
    if (attachmentImage)
      slide.addImage({
        data: attachmentImage,
        ...(await containedImage(attachmentImage, 0.75, 2.45, 5.9, 3.85)),
        altText: content.attachment?.name,
      });
    if (content.attachment) {
      const url = durableFileUrl(content.attachment.url);
      slide.addText(
        url ? "فتح الملف الأصلي" : "الملف الأصلي متاح ضمن حزمة الاعتماد ZIP",
        {
          x: 0.75,
          y: 6.4,
          w: 11.85,
          h: 0.35,
          fontFace: "Tahoma",
          fontSize: 12,
          color: cover ? "CFD9F2" : "5146D8",
          align: "right",
          rtlMode: true,
          ...(url ? { hyperlink: { url } } : {}),
        },
      );
    }
    slide.addText(`${idea.code} · ${data.settings.departmentName}`, {
      x: 1.1,
      y: 7.07,
      w: 11.5,
      h: 0.2,
      fontFace: "Tahoma",
      fontSize: 9,
      color: cover ? "A5B3D5" : "8290A6",
      align: "right",
      rtlMode: true,
    });
    slide.addText(`${index + 1} / ${slides.length}`, {
      x: 0.6,
      y: 7.03,
      w: 0.75,
      h: 0.25,
      fontSize: 10,
      color: cover ? "A5B3D5" : "8290A6",
      align: "left",
    });
    slide.addNotes(content.paragraphs.join("\n"));
  }
  const result = await pptx.write({
    outputType: "arraybuffer",
    compression: true,
  });
  return new Uint8Array(result as ArrayBuffer);
}

export async function exportIdeaPresentation(
  idea: Idea,
  data: MediaData,
): Promise<void> {
  const bytes = await createIdeaPresentation(idea, data);
  downloadBlob(
    new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    `${idea.code}-عرض-الاعتماد.pptx`,
  );
}

function safeFilename(value: string): string {
  return (
    value
      .replace(/[\x00-\x1f<>:"/\\|?*]/g, "_")
      .replace(/\.{2,}/g, "_")
      .slice(0, 160) || "attachment"
  );
}

const BUNDLE_LIMIT = 300 * 1024 * 1024;

/** Complete approval package preserves arbitrary original files beside the deck. */
export async function createApprovalBundle(
  idea: Idea,
  data: MediaData,
): Promise<Blob> {
  const total = idea.attachments.reduce((sum, file) => sum + file.size, 0);
  if (total > BUNDLE_LIMIT) throw new Error(`حجم المرفقات ${Math.ceil(total / 1024 / 1024)} ميجابايت أكبر من حد الحزمة (${BUNDLE_LIMIT / 1024 / 1024} ميجابايت). نزّل الملفات الكبيرة من تبويب الملفات، أو افتح مجلد المشروع في Drive من حساب مدير النظام.`);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(
    `${safeFilename(idea.code)}-عرض-الاعتماد.pptx`,
    await createIdeaPresentation(idea, data),
  );
  const files: {
    name: string;
    path: string;
    mime: string;
    size: number;
    kind: string;
    quotationVendor?: string;
  }[] = [];
  for (const [index, attachment] of idea.attachments.entries()) {
    let response: Response;
    try {
      response = await fetchAttachment(attachment);
    } catch {
      throw new Error(
        `تعذر تحميل المرفق «${attachment.name}». لم تُصدر حزمة ناقصة.`,
      );
    }
    if (!response.ok)
      throw new Error(
        `تعذر تحميل المرفق «${attachment.name}». لم تُصدر حزمة ناقصة.`,
      );
    const bytes = await response.arrayBuffer();
    const path = `المرفقات/${String(index + 1).padStart(2, "0")}-${safeFilename(attachment.name)}`;
    zip.file(path, bytes);
    files.push({
      name: attachment.name,
      path,
      mime: attachment.mime,
      size: bytes.byteLength,
      kind: attachment.kind,
      quotationVendor: idea.quotations.find(
        (quotation) => quotation.attachmentId === attachment.id,
      )?.vendor,
    });
  }
  zip.file(
    "بيانات-الفكرة.json",
    JSON.stringify(
      {
        idea,
        company: data.companies.find(
          (company) => company.id === idea.companyId,
        ),
        category: data.categories.find(
          (category) => category.id === idea.categoryId,
        ),
        owner: data.members.find((member) => member.id === idea.ownerId),
        designer: data.members.find((member) => member.id === idea.designerId),
        files,
        generatedAt: new Date().toISOString(),
      },
      (_key, value) =>
        typeof value === "string" && value.startsWith("data:")
          ? "[الملف الأصلي محفوظ في مجلد المرفقات]"
          : value,
      2,
    ),
  );
  zip.file(
    "اقرأني.txt",
    `حزمة اعتماد الفكرة: ${idea.title}\nالرمز: ${idea.code}\n\nتتضمن العرض التقديمي وجميع الملفات الأصلية وعروض الأسعار في مجلد المرفقات.\nالتفاصيل الكاملة وسجل المتابعة موجودة في بيانات-الفكرة.json.\nعدد المرفقات: ${files.length}\n`,
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function exportApprovalBundle(
  idea: Idea,
  data: MediaData,
): Promise<void> {
  downloadBlob(
    await createApprovalBundle(idea, data),
    `${idea.code}-حزمة-الاعتماد.zip`,
  );
}

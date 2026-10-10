"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { WORK_TYPE_LABELS, type MediaData } from "@/data/media";
import { CompanyLogo } from "./company-logo";
import {
  ActionButton,
  Channels,
  EmptyState,
  Icon,
  bytes,
  errorText,
  formatDate,
  today,
} from "./ui";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
}

export default function Archive({
  data,
  onOpenIdea,
}: {
  data: MediaData;
  onOpenIdea: (id: string) => void;
}) {
  const [tab, setTab] = useState("system"),
    [month, setMonth] = useState("all"),
    [company, setCompany] = useState("all"),
    [type, setType] = useState("all");
  const requestNumber = useRef(0);
  const [date, setDate] = useState(today()),
    [drive, setDrive] = useState<{
      configured: boolean;
      files: DriveFile[];
      message?: string;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const ideas = data.ideas
    .filter(
      (i) =>
        i.status === "delivered" &&
        (month === "all" || i.deliveredAt?.startsWith(month)) &&
        (company === "all" || i.companyId === company) &&
        (type === "all" || i.workType === type),
    )
    .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""));
  const months = [
    ...new Set(
      data.ideas
        .filter((i) => i.status === "delivered")
        .map((i) => i.deliveredAt?.slice(0, 7))
        .filter(Boolean),
    ),
  ]
    .sort()
    .reverse() as string[];
  async function loadDrive(selectedDate = date) {
    const request = ++requestNumber.current;
    setDrive(null);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/drive?date=${selectedDate}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ||
            "تعذر تحميل الأرشيف. تحقق من إعدادات الربط وأعد المحاولة.",
        );
      if (request === requestNumber.current) setDrive(result);
    } catch (e) {
      if (request === requestNumber.current) setError(errorText(e));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <ActionButton
            onClick={() => setTab("system")}
            aria-pressed={tab === "system"}
            className={
              tab === "system"
                ? "!bg-[var(--accent)] !text-[var(--primary)] !shadow-none"
                : ""
            }
          >
            <Icon name="archive" className="size-4" />
            الأعمال المسلّمة
          </ActionButton>
          <ActionButton
            onClick={() => {
              setTab("drive");
              void loadDrive();
            }}
            aria-pressed={tab === "drive"}
            className={
              tab === "drive"
                ? "!bg-[var(--accent)] !text-[var(--primary)] !shadow-none"
                : ""
            }
          >
            <Icon name="link" className="size-4" />
            Google Drive
          </ActionButton>
        </div>
        <span className="text-xs text-[var(--soft)]">
          كل النسخ النهائية مع تفاصيل طلبها
        </span>
      </div>
      {tab === "system" ? (
        <>
          <div className="flex flex-wrap gap-3">
            <label>
              <span className="sr-only">تصفية الأرشيف حسب الشهر</span>
              <select
                className="media-input !w-auto"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                <option value="all">كل الأشهر</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatDate(`${m}-01`, {
                      month: "long",
                      year: "numeric",
                      day: undefined,
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">تصفية الأرشيف حسب الشركة</span>
              <select
                className="media-input !w-auto"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="all">كل الشركات</option>
                {data.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">تصفية الأرشيف حسب نوع العمل</span>
              <select
                className="media-input !w-auto"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="all">كل أنواع الأعمال</option>
                {Object.entries(WORK_TYPE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {ideas.length ? (
            <div className="grid gap-5 min-[650px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {ideas.map((idea) => {
                const file =
                  idea.attachments.find(
                    (a) => a.kind === "final" && a.mime.startsWith("image/"),
                  ) || idea.attachments.find((a) => a.kind === "final");
                return (
                  <article key={idea.id} className="media-card overflow-hidden">
                    <ActionButton
                      aria-label={`عرض العمل: ${idea.title}`}
                      onClick={() => onOpenIdea(idea.id)}
                      className="relative !flex aspect-[16/9] h-auto w-full !rounded-none !bg-[#e8eaf3] !p-0 !shadow-none"
                    >
                      {file?.mime.startsWith("image/") ? (
                        <Image
                          unoptimized
                          width={640}
                          height={360}
                          alt={`معاينة ${idea.title}`}
                          src={
                            file.url.startsWith("/api/")
                              ? `${file.url}?inline=1`
                              : file.url
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-[var(--soft)]">
                          <Icon
                            name={
                              idea.workType === "video" ||
                              idea.workType === "motion"
                                ? "screen"
                                : "file"
                            }
                            className="size-10"
                          />
                          <span className="text-xs">
                            {WORK_TYPE_LABELS[idea.workType]} · معاينة التفاصيل
                          </span>
                        </div>
                      )}
                      <span className="absolute start-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[11px] text-[#20273c]">
                        {WORK_TYPE_LABELS[idea.workType]}
                      </span>
                    </ActionButton>
                    <div className="space-y-3 p-5">
                      <ActionButton
                        onClick={() => onOpenIdea(idea.id)}
                        className="h-auto !justify-start !rounded-none !p-0 text-start !whitespace-normal !shadow-none"
                      >
                        <span className="leading-relaxed font-bold">
                          {idea.title}
                        </span>
                      </ActionButton>
                      <p className="text-xs text-[var(--soft)]">
                        <CompanyLogo
                          companyId={idea.companyId}
                          decorative
                          className="mb-1 h-9 w-28"
                        />
                        <span className="block">
                          {
                            data.companies.find((c) => c.id === idea.companyId)
                              ?.name
                          }
                        </span>
                      </p>
                      <div className="flex items-center justify-between gap-2 text-xs text-[var(--soft)]">
                        <span>{formatDate(idea.deliveredAt)}</span>
                        <span>
                          {
                            idea.attachments.filter((a) => a.kind === "final")
                              .length
                          }{" "}
                          ملفات نهائية
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                        <Channels channels={idea.channels} />
                        <ActionButton
                          onClick={() => onOpenIdea(idea.id)}
                          className="!px-2 !text-xs !shadow-none"
                        >
                          التفاصيل
                          <Icon name="arrow" className="size-3" />
                        </ActionButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="لم تُسلّم أعمال في هذا الاختيار"
              description="تظهر الأعمال هنا تلقائيًا بعد إرفاق النسخ النهائية وتسجيل التسليم من استوديو التصميم."
            />
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="media-label !mb-0">
              تاريخ تعديل الملفات بتوقيت الرياض
              <input
                type="date"
                required
                className="media-input mt-2 !w-auto"
                value={date}
                onChange={(e) => {
                  if (e.target.value) {
                    setDate(e.target.value);
                    void loadDrive(e.target.value);
                  }
                }}
              />
            </label>
            <ActionButton disabled={loading} onClick={() => void loadDrive()}>
              <Icon name="refresh" className="size-4" />
              {loading ? "جارٍ التحديث…" : "تحديث المجلد"}
            </ActionButton>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[#fff0f1] p-4 text-[var(--danger)]"
            >
              {error}
            </p>
          )}
          {loading && (
            <div
              className="media-card p-8 text-center text-[var(--soft)]"
              role="status"
            >
              جارٍ قراءة ملفات مجلد الفريق…
            </div>
          )}
          {!loading && drive && !drive.configured && (
            <EmptyState
              title="أرشيف Google Drive ينتظر الربط"
              description={
                drive.message ||
                "أدخل معرّف المجلد من إدارة النظام، وأضف بيانات حساب الخدمة إلى الخادم ليظهر الأرشيف هنا."
              }
            />
          )}
          {!loading &&
            drive?.configured &&
            (!drive.files.length ? (
              <EmptyState
                title="لا توجد ملفات في هذا اليوم"
                description="اختر تاريخًا آخر أو ارفع الأعمال إلى مجلد الفريق ثم حدّث العرض."
              />
            ) : (
              <div className="media-card divide-y divide-[var(--border)] overflow-hidden">
                {drive.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="rounded-xl bg-[var(--accent)] p-3 text-[var(--primary)]">
                        <Icon name="file" />
                      </span>
                      <div className="min-w-0">
                        <span className="block font-medium break-all">
                          <bdi>{file.name}</bdi>
                        </span>
                        <span className="mt-1 block text-xs text-[var(--soft)]">
                          {formatDate(file.modifiedTime)}
                          {file.size && ` · ${bytes(Number(file.size))}`}
                        </span>
                      </div>
                    </div>
                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="media-button media-button-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm"
                      >
                        فتح في Drive
                        <Icon name="link" className="size-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ))}
        </>
      )}
    </>
  );
}

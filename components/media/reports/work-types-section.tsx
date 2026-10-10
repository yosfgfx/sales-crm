import type { monthlyReport } from "@/lib/media-exports";

type MonthlyReport = ReturnType<typeof monthlyReport>;

export function WorkTypesSection({
  report,
  activeTypes,
}: {
  report: MonthlyReport;
  activeTypes: MonthlyReport["workTypes"];
}) {
  let angle = 0;
  const gradient = activeTypes
    .map((type) => {
      const start = angle;
      angle += (type.count / Math.max(report.count, 1)) * 360;
      return `${type.color} ${start}deg ${angle}deg`;
    })
    .join(", ");
  return (
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
  );
}

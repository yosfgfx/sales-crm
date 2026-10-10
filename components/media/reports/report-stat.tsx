import { Icon } from "../ui";

export function ReportStat({
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

"use client";

import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import Button from "@/components/_ui/button";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Idea,
} from "@/data/media";

export type IconName =
  | "home"
  | "ideas"
  | "check"
  | "design"
  | "calendar"
  | "archive"
  | "report"
  | "settings"
  | "search"
  | "plus"
  | "bell"
  | "arrow"
  | "close"
  | "file"
  | "upload"
  | "download"
  | "screen"
  | "whatsapp"
  | "email"
  | "grid"
  | "list"
  | "clock"
  | "people"
  | "spark"
  | "link"
  | "logout"
  | "refresh"
  | "chevron";

const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3z" />
      <path d="M9 20v-7h6v7" />
    </>
  ),
  ideas: (
    <>
      <path d="M8 15a7 7 0 1 1 8 0l-1 3H9z" />
      <path d="M9 21h6M10 18h4" />
    </>
  ),
  check: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="m7 12 3 3 7-7" />
    </>
  ),
  design: (
    <>
      <path d="m15 4 5 5-11 11H4v-5zM12 7l5 5" />
      <path d="m17 2 5 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3" />
    </>
  ),
  archive: (
    <>
      <path d="M3 8h18v13H3zM2 3h20v5H2zM9 12h6" />
    </>
  ),
  report: (
    <>
      <path d="M5 3h11l4 4v14H5zM16 3v5h4M9 16v-4M13 16V9M17 16v-3" />
    </>
  ),
  settings: (
    <>
      <path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3zM10 21h4" />
    </>
  ),
  arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  file: (
    <>
      <path d="M5 3h10l5 5v13H5zM15 3v6h5M9 13h7M9 17h5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v13m-5-5 5 5 5-5M4 15v6h16v-6" />
    </>
  ),
  screen: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20 5 16a9 9 0 1 1 3 3z" />
      <path d="M8 7c0 5 4 9 9 9l1-3-3-1-1 1-3-3 1-1-1-3z" />
    </>
  ),
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 5v2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />
      <path d="M20 3v4M18 5h4" />
    </>
  ),
  link: (
    <>
      <path
        d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"
        transform="translate(1 0) scale(.9)"
      />
    </>
  ),
  logout: (
    <>
      <path d="M9 3H3v18h6M9 12h12m-4-4 4 4-4 4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7V2l-3 3a9 9 0 0 0-14 7M4 17v5l3-3a9 9 0 0 0 14-7M16 7h4M4 17h4" />
    </>
  ),
  chevron: <path d="m8 5 7 7-7 7" />,
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", className)}
    >
      {paths[name]}
    </svg>
  );
}

export function ActionButton({
  primary,
  className,
  ...props
}: ComponentProps<typeof Button> & { primary?: boolean }) {
  return (
    <Button
      variant={primary ? "primary" : "secondary"}
      size="md"
      className={cn(
        "media-button min-h-10 max-w-full rounded-xl px-4 py-2.5 text-sm !whitespace-normal",
        primary
          ? "media-button-primary !shadow-[0_2px_4px_#6250d820]"
          : "media-button-secondary !shadow-[0_0_0_1px_var(--border)]",
        className,
      )}
      {...props}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
  drawer,
  locked,
}: {
  open: boolean;
  onClose: () => void;
  locked?: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !locked) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#121a2f]/45 backdrop-blur-sm" />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn(
            "media-theme fixed z-50 flex max-h-[94dvh] w-[calc(100%-2rem)] flex-col overflow-hidden bg-white shadow-2xl outline-none",
            drawer
              ? "inset-y-0 end-0 max-h-dvh w-full rounded-s-3xl md:max-w-[850px]"
              : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl",
            !drawer && (wide ? "max-w-[850px]" : "max-w-[520px]"),
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="min-w-0 flex-1 break-words">
              <DialogPrimitive.Title className="media-modal-title">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                className={cn(
                  "mt-1 text-sm text-[var(--soft)]",
                  !description && "sr-only",
                )}
              >
                {description || title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <ActionButton aria-label="إغلاق النافذة" className="size-10 px-0" disabled={locked} title={locked ? "انتظر حتى تكتمل العملية" : undefined}>
                <Icon name="close" />
              </ActionButton>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function StatusBadge({ status }: { status: Idea["status"] }) {
  const tone =
    status === "delivered"
      ? "success"
      : status === "changes"
        ? "warning"
        : ["designing", "design_review", "scheduled", "approved"].includes(
              status,
            )
          ? "accent"
          : "neutral";
  return (
    <span className={cn("media-badge", `media-badge-${tone}`)}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Idea["priority"] }) {
  return (
    <span
      className={cn(
        "text-xs",
        priority === "urgent"
          ? "text-[var(--danger)]"
          : priority === "high"
            ? "text-[var(--warning)]"
            : "text-[var(--soft)]",
      )}
    >
      {priority === "urgent" ? "↑↑ " : priority === "high" ? "↑ " : "↔ "}
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function Channels({
  channels,
  labels,
}: {
  channels: Idea["channels"];
  labels?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {channels.map((channel) => (
        <span
          key={channel}
          title={CHANNEL_LABELS[channel]}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] p-1.5 text-xs text-[var(--soft)]"
        >
          <Icon
            name={channel === "screens" ? "screen" : channel}
            className="size-3.5"
          />
          <span className={labels ? undefined : "sr-only"}>
            {CHANNEL_LABELS[channel]}
          </span>
        </span>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="media-card flex flex-col items-center gap-3 px-5 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
        <Icon name="ideas" className="size-7" />
      </span>
      <h3>{title}</h3>
      <p className="max-w-[32em] text-[var(--soft)]">{description}</p>
      {action}
    </div>
  );
}

export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
}
export function formatDate(
  date?: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return date
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        timeZone: "Asia/Riyadh",
        day: "numeric",
        month: "short",
        ...options,
      }).format(new Date(date.length === 10 ? `${date}T12:00:00+03:00` : date))
    : "لم يُحدد";
}
export function bytes(size: number) {
  return size > 1048576
    ? `${(size / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "تعذر إتمام العملية. أعد المحاولة.";
}

export function TabList({
  label,
  items,
  value,
  onChange,
  idPrefix,
  compact,
}: {
  label: string;
  items: { id: string; label: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  idPrefix: string;
  compact?: boolean;
}) {
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 1, ArrowUp: -1 };
    if (!(event.key in keys) && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = items.findIndex((item) => item.id === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + keys[event.key] + items.length) % items.length;
    onChange(items[next].id);
    document.getElementById(`${idPrefix}-tab-${items[next].id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={move} className={cn("flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
      {items.map((item) => (
        <ActionButton
          key={item.id}
          role="tab"
          id={`${idPrefix}-tab-${item.id}`}
          aria-selected={value === item.id}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          className={cn(compact && "!px-3 !text-xs !shadow-none", value === item.id ? "!bg-[var(--accent)] !text-[var(--primary)] !shadow-none" : compact ? "!bg-transparent" : "")}
        >
          {item.label}
        </ActionButton>
      ))}
    </div>
  );
}

export const NOUNS = {
  idea: { one: "فكرة واحدة", two: "فكرتان", few: "أفكار", many: "فكرة" },
  work: { one: "عمل واحد", two: "عملان", few: "أعمال", many: "عملاً" },
  file: { one: "ملف واحد", two: "ملفان", few: "ملفات", many: "ملفاً" },
  attachment: { one: "مرفق واحد", two: "مرفقان", few: "مرفقات", many: "مرفقاً" },
  quote: { one: "عرض سعر واحد", two: "عرضا سعر", few: "عروض أسعار", many: "عرض سعر" },
  channel: { one: "قناة واحدة", two: "قناتان", few: "قنوات", many: "قناة" },
} as const;

export const formatCount = (value: number) => value.toLocaleString("ar-SA");

export function countText(value: number, noun: keyof typeof NOUNS) {
  const forms = NOUNS[noun];
  if (value === 1) return forms.one;
  if (value === 2) return forms.two;
  const number = formatCount(value);
  return value >= 3 && value <= 10 ? `${number} ${forms.few}` : `${number} ${forms.many}`;
}

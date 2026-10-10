"use client";

import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import Button from "@/components/_ui/button";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABELS,
  PRIORITY_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  type Idea,
} from "@/data/media";
import { Icon } from "./ui-icons";

export { Icon, type IconName } from "./ui-icons";

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
    <span className={cn("media-badge", `media-badge-${tone}`)} title={STATUS_HINTS[status]}>
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

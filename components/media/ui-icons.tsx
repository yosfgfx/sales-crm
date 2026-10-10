"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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

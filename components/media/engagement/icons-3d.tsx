"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Icon3DName = "sun" | "moon" | "flame" | "target" | "timer" | "team" | "trophy" | "video" | "bell" | "check" | "calendar" | "note" | "flag" | "bolt" | "chart" | "medal" | "chat" | "sparkle" | "rocket";

const PALETTE: Record<string, [string, string]> = {
  violet: ["#A99BF5", "#5140B8"],
  amber: ["#FFD27A", "#E08A1E"],
  green: ["#5FDDA6", "#1E8A5F"],
  teal: ["#5FD3C6", "#11665E"],
  rose: ["#FF9AA8", "#C23A55"],
  navy: ["#6C7BB0", "#1D243C"],
  sky: ["#8FD0FF", "#2F6FD6"],
};

function shapes(name: Icon3DName, g: (tone: keyof typeof PALETTE) => string): ReactNode {
  switch (name) {
    case "sun":
      return (<><circle cx="16" cy="16" r="7.5" fill={g("amber")} /><g stroke="#F7B955" strokeWidth="2.4" strokeLinecap="round"><path d="M16 2.5v3.2M16 26.3v3.2M2.5 16h3.2M26.3 16h3.2M6.4 6.4l2.3 2.3M23.3 23.3l2.3 2.3M25.6 6.4l-2.3 2.3M8.7 23.3l-2.3 2.3" /></g><ellipse cx="13.6" cy="13" rx="3" ry="1.5" fill="#fff" opacity=".55" /></>);
    case "moon":
      return (<><path d="M21 4.5A11.5 11.5 0 1 0 27.5 21 9 9 0 0 1 21 4.5z" fill={g("violet")} /><ellipse cx="11" cy="12" rx="3" ry="1.4" fill="#fff" opacity=".45" /></>);
    case "flame":
      return (<><path d="M16 3c1.5 5 7.5 7.4 7.5 14.3A7.5 7.5 0 0 1 8.5 17.3c0-3.6 2-5.6 3.4-7.3.3 2.2 1.3 3.6 2.6 4.2C14.4 10 15 6.5 16 3z" fill={g("amber")} /><path d="M16 15c1 2.6 3.6 3.6 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2.2 2.2-3.3 3.6-6.4z" fill="#FFF1C9" /></>);
    case "target":
      return (<><circle cx="16" cy="16" r="12.5" fill={g("rose")} /><circle cx="16" cy="16" r="8.4" fill="#fff" /><circle cx="16" cy="16" r="4.6" fill={g("rose")} /><path d="M16 16 27 5" stroke="#1D243C" strokeWidth="2" strokeLinecap="round" /><path d="M27 5l-1 4 3-1z" fill="#1D243C" /></>);
    case "timer":
      return (<><rect x="13" y="2.5" width="6" height="3" rx="1.2" fill="#3F2FA0" /><circle cx="16" cy="18" r="11" fill={g("violet")} /><circle cx="16" cy="18" r="7.6" fill="#fff" /><path d="M16 18V12.6" stroke="#5140B8" strokeWidth="2.4" strokeLinecap="round" /><circle cx="16" cy="18" r="1.6" fill="#5140B8" /></>);
    case "team":
      return (<><circle cx="11.5" cy="11" r="4.6" fill={g("teal")} /><path d="M3.5 26c0-5 3.6-8 8-8s8 3 8 8z" fill={g("teal")} /><circle cx="21.5" cy="12.5" r="4" fill={g("violet")} /><path d="M15 26.5c.4-4.4 3.2-7 6.5-7s6.5 2.6 7 7z" fill={g("violet")} /></>);
    case "trophy":
      return (<><path d="M9.5 4h13v7c0 5-3 8.5-6.5 8.5S9.5 16 9.5 11z" fill={g("amber")} /><path d="M9.5 6.5H5c0 4.6 2.2 7 5 7M22.5 6.5H27c0 4.6-2.2 7-5 7" fill="none" stroke="#E8A73C" strokeWidth="2" /><rect x="14" y="19" width="4" height="4" fill="#D9901E" /><rect x="9.5" y="23" width="13" height="5" rx="2" fill="#8E5A12" /><ellipse cx="13" cy="8" rx="2" ry="1.2" fill="#fff" opacity=".6" /></>);
    case "video":
      return (<><rect x="3" y="8" width="18" height="16" rx="5" fill={g("teal")} /><path d="M22.5 13.5 29 9.5v13l-6.5-4z" fill={g("green")} /><ellipse cx="9" cy="11.5" rx="3" ry="1.3" fill="#fff" opacity=".45" /></>);
    case "bell":
      return (<><path d="M16 3.5c4.8 0 8.4 3.6 8.4 8.4v6l2.4 3.6H5.2l2.4-3.6v-6c0-4.8 3.6-8.4 8.4-8.4z" fill={g("amber")} /><circle cx="16" cy="25.5" r="3" fill="#C9761A" /><ellipse cx="12.5" cy="9" rx="2.4" ry="1.2" fill="#fff" opacity=".55" /></>);
    case "check":
      return (<><circle cx="16" cy="16" r="12.5" fill={g("green")} /><path d="M10.5 16.5l3.8 3.8 7.4-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>);
    case "calendar":
      return (<><rect x="4" y="6" width="24" height="22" rx="5" fill={g("sky")} /><rect x="4" y="6" width="24" height="7" rx="3" fill="#1D4FA8" /><g fill="#fff"><rect x="9" y="16" width="4" height="4" rx="1" /><rect x="15" y="16" width="4" height="4" rx="1" /><rect x="21" y="16" width="4" height="4" rx="1" opacity=".6" /><rect x="9" y="22" width="4" height="3" rx="1" opacity=".6" /></g><rect x="9" y="3" width="3" height="6" rx="1.4" fill="#1D243C" /><rect x="20" y="3" width="3" height="6" rx="1.4" fill="#1D243C" /></>);
    case "note":
      return (<><path d="M7 3.5h13l6 6v17a2.5 2.5 0 0 1-2.5 2.5h-16A2.5 2.5 0 0 1 5 26.5v-20A3 3 0 0 1 7 3.5z" fill={g("violet")} /><path d="M20 3.5v6h6" fill="#C9C1F7" /><g stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".9"><path d="M10 15h12M10 19.5h12M10 24h7" /></g></>);
    case "flag":
      return (<><rect x="6" y="3" width="2.6" height="26" rx="1.3" fill="#1D243C" /><path d="M8.6 5h16l-3.6 5.5 3.6 5.5h-16z" fill={g("rose")} /><ellipse cx="13" cy="7.6" rx="2.6" ry="1" fill="#fff" opacity=".5" /></>);
    case "bolt":
      return (<><path d="M18.5 2.5 6.5 18h8l-2 11.5L25.5 13h-8.2z" fill={g("amber")} /><path d="M18.5 2.5 12 11h3z" fill="#fff" opacity=".45" /></>);
    case "chart":
      return (<><rect x="4" y="16" width="6" height="12" rx="2" fill={g("teal")} /><rect x="13" y="9" width="6" height="19" rx="2" fill={g("violet")} /><rect x="22" y="4" width="6" height="24" rx="2" fill={g("amber")} /></>);
    case "medal":
      return (<><path d="M10 3h4.5l3.5 8h-4.5zM22 3h-4.5L14 11h4.5z" fill={g("rose")} /><circle cx="16" cy="20" r="9" fill={g("amber")} /><circle cx="16" cy="20" r="5.6" fill="#FFE29A" /><path d="M16 16.6l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="#C77B12" /></>);
    case "chat":
      return (<><path d="M5 7.5A4.5 4.5 0 0 1 9.5 3h13A4.5 4.5 0 0 1 27 7.5v9a4.5 4.5 0 0 1-4.5 4.5H14l-6 5v-5.3A4.5 4.5 0 0 1 5 16.5z" fill={g("violet")} /><g fill="#fff"><circle cx="11" cy="12" r="1.7" /><circle cx="16" cy="12" r="1.7" /><circle cx="21" cy="12" r="1.7" /></g></>);
    case "sparkle":
      return (<><path d="M16 2.5c1 6.5 3.5 9 10 10-6.5 1-9 3.5-10 10-1-6.5-3.5-9-10-10 6.5-1 9-3.5 10-10z" fill={g("violet")} /><path d="M25 20c.5 3 1.6 4.1 4.5 4.5-2.9.5-4 1.6-4.5 4.5-.5-2.9-1.6-4-4.5-4.5 2.9-.4 4-1.5 4.5-4.5z" fill={g("amber")} /></>);
    case "rocket":
      return (<><path d="M16 2.5c5 3 7 8.5 6 15.5h-12c-1-7 1-12.5 6-15.5z" fill={g("violet")} /><circle cx="16" cy="11" r="2.8" fill="#fff" /><path d="M10 14l-4 6 4.5-.5zM22 14l4 6-4.5-.5z" fill={g("rose")} /><path d="M13 18.5h6l-3 9z" fill={g("amber")} /></>);
  }
}

export function Icon3D({ name, className, label }: { name: Icon3DName; className?: string; label?: string }) {
  const id = useId().replace(/:/g, "");
  const used = new Set<string>();
  const g = (tone: keyof typeof PALETTE) => {
    used.add(tone);
    return `url(#${id}-${tone})`;
  };
  const body = shapes(name, g);
  return (
    <svg
      viewBox="0 0 32 32"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("media-icon-3d size-8 shrink-0", className)}
    >
      <defs>
        {[...used].map((tone) => (
          <linearGradient key={tone} id={`${id}-${tone}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={PALETTE[tone][0]} />
            <stop offset="1" stopColor={PALETTE[tone][1]} />
          </linearGradient>
        ))}
      </defs>
      {body}
    </svg>
  );
}

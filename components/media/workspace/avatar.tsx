"use client";

import { useTeamPresence, isOnline } from "@/stores/team-presence";

export function Avatar({ name, memberId }: { name: string; memberId?: string }) {
  const online = useTeamPresence((state) => (memberId ? isOnline(state, memberId) : false));
  return (
    <span
      aria-hidden="true"
      className="relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-[#d3c6f4] text-sm font-bold text-[#514077]"
    >
      {name
        .split(" ")
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
      {online && <PresenceDot />}
    </span>
  );
}

export function PresenceDot({ className = "" }: { className?: string }) {
  return (
    <span
      className={`media-presence-dot absolute -bottom-0.5 -start-0.5 size-3 rounded-full border-2 border-white bg-[#22B573] ${className}`}
    />
  );
}

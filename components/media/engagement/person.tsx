"use client";

import type { TeamMember } from "@/data/media";
import { cn } from "@/lib/utils";
import { isOnline, useTeamPresence } from "@/stores/team-presence";

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-24 text-4xl" } as const;
const FALLBACK = ["#65829E", "#C99672", "#A883BA", "#DB8354", "#16867B", "#5B6FD6"];

export function memberColor(member?: Pick<TeamMember, "id" | "color">) {
  if (member?.color && /^#[0-9a-f]{6}$/i.test(member.color)) return member.color;
  const seed = [...(member?.id || "x")].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return FALLBACK[seed % FALLBACK.length];
}

export function useOnline(memberId?: string) {
  return useTeamPresence((state) => (memberId ? isOnline(state, memberId) : false));
}

export function PersonAvatar({
  member,
  size = "md",
  ring,
  showPresence = true,
  className,
}: {
  member?: TeamMember;
  size?: keyof typeof SIZES;
  ring?: string;
  showPresence?: boolean;
  className?: string;
}) {
  const online = useOnline(member?.id);
  const initial = member?.initials?.trim() || member?.name?.trim()?.[0] || "؟";
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", SIZES[size], className)}
      style={{ background: memberColor(member), boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}
    >
      {[...initial][0]}
      {showPresence && online && (
        <span className={cn("media-presence-dot absolute -bottom-0.5 -start-0.5 rounded-full border-2 border-white bg-[#22B573]", size === "xl" ? "size-6" : size === "lg" ? "size-4" : "size-3")} />
      )}
    </span>
  );
}

export function PresenceLabel({ memberId, className }: { memberId: string; className?: string }) {
  const online = useOnline(memberId);
  return <span className={cn("sr-only", className)}>{online ? "متصل الآن" : "غير متصل"}</span>;
}

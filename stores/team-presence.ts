"use client";

import { create } from "zustand";
import type { MediaNotification } from "@/data/media";

export const ONLINE_WINDOW_MS = 150_000;

type TeamPresence = {
  connected: boolean;
  completed: Record<string, number>;
  achievement: MediaNotification | null;
  online: Record<string, number>;
  live: Record<string, true>;
};

export const useTeamPresence = create<TeamPresence>(() => ({
  connected: false,
  completed: {},
  achievement: null,
  online: {},
  live: {},
}));

export function isOnline(state: Pick<TeamPresence, "online" | "live">, memberId: string, now = Date.now()) {
  if (state.live[memberId]) return true;
  const seen = state.online[memberId];
  return !!seen && now - seen < ONLINE_WINDOW_MS;
}

"use client";

import { create } from "zustand";
import type { MediaNotification } from "@/data/media";

export const ONLINE_WINDOW_MS = 150_000;

type TeamPresence = {
  connected: boolean;
  completed: Record<string, number>;
  achievement: MediaNotification | null;
  online: Record<string, number>;
};

export const useTeamPresence = create<TeamPresence>(() => ({
  connected: false,
  completed: {},
  achievement: null,
  online: {},
}));

export function isOnline(online: Record<string, number>, memberId: string, now = Date.now()) {
  const seen = online[memberId];
  return !!seen && (seen === Infinity || now - seen < ONLINE_WINDOW_MS);
}

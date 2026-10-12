"use client";

import { create } from "zustand";
import type { MediaNotification } from "@/data/media";

type TeamPresence = {
  connected: boolean;
  completed: Record<string, number>;
  achievement: MediaNotification | null;
};

export const useTeamPresence = create<TeamPresence>(() => ({
  connected: false,
  completed: {},
  achievement: null,
}));

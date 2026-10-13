"use client";

import { create } from "zustand";
import type { EngagementState, Meeting, MemberProfile } from "@/data/engagement";
import { useTeamPresence } from "./team-presence";

type Action = Record<string, unknown> & { action: string };

interface EngagementStore {
  state: EngagementState | null;
  loading: boolean;
  error: string | null;
  profiles: Record<string, MemberProfile>;
  load: () => Promise<void>;
  act: <T = unknown>(payload: Action, options?: { reload?: boolean }) => Promise<T>;
  loadProfile: (memberId: string) => Promise<MemberProfile>;
  mergeMeeting: (meeting: Meeting) => void;
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "تعذر إتمام الطلب. أعد المحاولة.");
  return body as T;
}

let inflight: Promise<void> | null = null;

function syncPresence(state: EngagementState) {
  const online: Record<string, number> = {};
  for (const member of state.team) if (member.lastSeenAt) online[member.memberId] = Date.parse(member.lastSeenAt);
  useTeamPresence.setState((current) => ({ online: { ...current.online, ...online } }));
}

export const useEngagement = create<EngagementStore>((set, get) => ({
  state: null,
  loading: false,
  error: null,
  profiles: {},
  load: () => {
    if (inflight) return inflight;
    set({ loading: true });
    inflight = request<EngagementState>("/api/engagement")
      .then((state) => {
        syncPresence(state);
        set({ state, error: null });
      })
      .catch((error: Error) => set({ error: error.message }))
      .finally(() => {
        inflight = null;
        set({ loading: false });
      });
    return inflight;
  },
  act: async (payload, options = {}) => {
    const result = await request<Record<string, unknown>>("/api/engagement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (result.meeting) get().mergeMeeting(result.meeting as Meeting);
    if (result.online) {
      const online: Record<string, number> = {};
      for (const entry of result.online as { memberId: string; lastSeenAt: string | null }[]) if (entry.lastSeenAt) online[entry.memberId] = Date.parse(entry.lastSeenAt);
      useTeamPresence.setState({ online });
    }
    if (options.reload !== false) await get().load();
    return result as never;
  },
  loadProfile: async (memberId) => {
    const profile = await request<MemberProfile>(`/api/engagement?profile=${encodeURIComponent(memberId)}`);
    set((state) => ({ profiles: { ...state.profiles, [memberId]: profile } }));
    return profile;
  },
  mergeMeeting: (meeting) =>
    set((current) =>
      current.state
        ? { state: { ...current.state, meetings: current.state.meetings.some((item) => item.id === meeting.id) ? current.state.meetings.map((item) => (item.id === meeting.id ? meeting : item)) : [...current.state.meetings, meeting].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) } }
        : current,
    ),
}));

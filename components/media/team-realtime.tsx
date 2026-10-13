"use client";

import { useEffect, useRef } from "react";
import type { TeamMember } from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { useTeamPresence } from "@/stores/team-presence";
import { ActionButton, Icon } from "./ui";
import { Avatar } from "./workspace/avatar";

export default function TeamRealtime({
  currentUser,
  onOpenIdea,
}: {
  currentUser: TeamMember;
  onOpenIdea: (id: string) => void;
}) {
  const achievement = useTeamPresence((state) => state.achievement);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const actor = useMediaStore((state) =>
    state.data.members.find((member) => member.id === achievement?.actorId),
  );
  const achieverName =
    achievement?.actorName || actor?.name || "أحد أعضاء الفريق";
  useEffect(() => {
    let ended = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshNeeded = false;
    const known = new Set(
      useMediaStore.getState().data.notifications.map((notice) => notice.id),
    );
    const updateConnection = (connected: boolean) => {
      useTeamPresence.setState({ connected });
      window.dispatchEvent(
        new CustomEvent("wasl:connection", { detail: { connected } }),
      );
    };
    const refresh = () => {
      refreshNeeded = true;
      if (ended || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (!useMediaStore.getState().saving) {
          refreshNeeded = false;
          void useMediaStore.getState().refresh();
        }
      }, 250);
    };
    const unsubscribe = useMediaStore.subscribe((next, previous) => {
      if (
        next.currentUser?.id !== currentUser.id ||
        previous.currentUser?.id !== currentUser.id
      )
        return;
      if (refreshNeeded && previous.saving && !next.saving) refresh();
      if (next.data === previous.data) return;
      const prior = new Map(
        previous.data.ideas.map((idea) => [idea.id, idea.status]),
      );
      const completedIds = next.data.ideas
        .filter(
          (idea) =>
            !idea.deletedAt &&
            idea.status === "delivered" &&
            prior.has(idea.id) &&
            prior.get(idea.id) !== "delivered",
        )
        .map((idea) => idea.id);
      if (completedIds.length) {
        const expires = Date.now() + 4500;
        useTeamPresence.setState((state) => ({
          completed: {
            ...state.completed,
            ...Object.fromEntries(completedIds.map((id) => [id, expires])),
          },
        }));
        timers.current.push(
          setTimeout(
            () =>
              useTeamPresence.setState((state) => ({
                completed: Object.fromEntries(
                  Object.entries(state.completed).filter(
                    ([, until]) => until > Date.now(),
                  ),
                ),
              })),
            4600,
          ),
        );
      }
      const incoming = next.data.notifications.filter(
        (notice) => !known.has(notice.id),
      );
      incoming.forEach((notice) => known.add(notice.id));
      for (const notice of incoming) {
        if (
          !notice.read &&
          notice.type === "achievement" &&
          notice.recipientId === currentUser.id
        ) {
          useTeamPresence.setState({ achievement: notice });
          break;
        }
      }
    });
    let source: EventSource | undefined;
    let live: { stop: () => void } | undefined;
    let lastSignal = 0;
    let pendingSignal: ReturnType<typeof setTimeout> | undefined;
    const signal = (detail: unknown = {}) => {
      window.dispatchEvent(new CustomEvent("wasl:realtime", { detail }));
      const wait = 1500 - (Date.now() - lastSignal);
      if (wait <= 0) {
        lastSignal = Date.now();
        refresh();
      } else if (!pendingSignal) {
        pendingSignal = setTimeout(() => {
          pendingSignal = undefined;
          lastSignal = Date.now();
          refresh();
        }, wait);
      }
    };
    const openEventSource = () => {
      if (ended || typeof EventSource === "undefined") return;
      source = new EventSource("/api/events");
      source.onopen = () => updateConnection(true);
      source.onerror = () => updateConnection(false);
      source.addEventListener("ready", () => signal());
      source.addEventListener("update", (event) => {
        let detail: unknown = {};
        try {
          detail = JSON.parse((event as MessageEvent).data);
        } catch {
          detail = {};
        }
        signal(detail);
      });
      source.addEventListener("auth", () => {
        source?.close();
        updateConnection(false);
        refresh();
      });
    };
    void fetch("/api/realtime", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .catch(() => ({ enabled: false }))
      .then(async (config: { enabled: boolean; url?: string; key?: string; topic?: string }) => {
        if (ended) return;
        if (!config.enabled || !config.url || !config.key || !config.topic) {
          openEventSource();
          return;
        }
        const { RealtimeClient } = await import("@supabase/realtime-js");
        if (ended) return;
        const client = new RealtimeClient(config.url, { params: { apikey: config.key }, timeout: 20_000 });
        const channel = client.channel(config.topic, { config: { private: false, broadcast: { self: false }, presence: { key: currentUser.id } } });
        channel.on("broadcast", { event: "update" }, (message) => signal(message.payload ?? {}));
        channel.on("presence", { event: "sync" }, () => {
          const present = Object.keys(channel.presenceState());
          useTeamPresence.setState({ live: Object.fromEntries(present.map((id) => [id, true as const])) });
        });
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            updateConnection(true);
            void channel.track({ at: Date.now() });
            signal();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") updateConnection(false);
        });
        live = {
          stop: () => {
            void client.removeAllChannels();
            client.disconnect();
          },
        };
      });
    const fallback = setInterval(() => {
      if (!document.hidden && !useTeamPresence.getState().connected) refresh();
    }, 15_000);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    return () => {
      ended = true;
      source?.close();
      live?.stop();
      if (pendingSignal) clearTimeout(pendingSignal);
      unsubscribe();
      clearInterval(fallback);
      if (refreshTimer) clearTimeout(refreshTimer);
      timers.current.forEach(clearTimeout);
      timers.current = [];
      window.removeEventListener("focus", focus);
      updateConnection(false);
      useTeamPresence.setState({ completed: {}, achievement: null, live: {} });
    };
  }, [currentUser.id]);
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {achievement && (
        <aside
          className="media-achievement-toast fixed inset-x-4 bottom-4 z-[70] overflow-hidden rounded-2xl border border-[#a9d9c4] bg-[#f0faf5] p-5 text-[#145c43] shadow-lg sm:start-auto sm:end-6 sm:w-[26em]"
          aria-label="تهنئة بالإنجاز"
        >
          <div
            aria-hidden="true"
            className="media-achievement-confetti pointer-events-none absolute inset-0 overflow-hidden"
          >
            {Array.from({ length: 10 }, (_, index) => (
              <i
                key={index}
                style={{
                  insetInlineStart: `${8 + index * 9}%`,
                  animationDelay: `${index * 35}ms`,
                  backgroundColor: ["#197254", "#6250d8", "#d5a54d"][index % 3],
                }}
              />
            ))}
          </div>
          <div className="relative flex items-start gap-3">
            <span
              className="media-achievement-icon flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#dcefe4]"
              aria-hidden="true"
            >
              <Icon name="trophy" className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="!text-base">{achievement.title}</h2>
              <p className="mt-2 text-sm break-words">{achievement.body}</p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <Avatar name={achieverName} />
                <span>{achieverName} · إنجاز يستحق التقدير</span>
              </div>
              {achievement.ideaId && (
                <ActionButton
                  className="mt-4 !bg-white !text-[#145c43]"
                  onClick={() => {
                    onOpenIdea(achievement.ideaId);
                    useTeamPresence.setState({ achievement: null });
                  }}
                >
                  عرض الإنجاز
                </ActionButton>
              )}
            </div>
            <ActionButton
              aria-label="إغلاق التهنئة"
              className="size-10 shrink-0 !bg-transparent !p-0 !text-[#145c43] !shadow-none"
              onClick={() => useTeamPresence.setState({ achievement: null })}
            >
              <Icon name="close" />
            </ActionButton>
          </div>
        </aside>
      )}
    </div>
  );
}

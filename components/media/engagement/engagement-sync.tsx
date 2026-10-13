"use client";

import { useEffect } from "react";
import { useEngagement } from "@/stores/engagement-store";

export default function EngagementSync({ memberId }: { memberId: string }) {
  useEffect(() => {
    const { load, act } = useEngagement.getState();
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const beat = () => {
      if (document.visibilityState === "visible") void act({ action: "heartbeat" }, { reload: false }).catch(() => undefined);
    };
    void load();
    beat();
    const heartbeat = setInterval(beat, 60_000);
    const visibility = () => {
      if (document.visibilityState === "visible") {
        beat();
        void load();
      }
    };
    const realtime = () => {
      if (reloadTimer) return;
      reloadTimer = setTimeout(() => {
        reloadTimer = undefined;
        void useEngagement.getState().load();
      }, 1200);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("wasl:realtime", realtime);
    return () => {
      clearInterval(heartbeat);
      if (reloadTimer) clearTimeout(reloadTimer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("wasl:realtime", realtime);
      useEngagement.setState({ state: null, profiles: {} });
    };
  }, [memberId]);
  return null;
}

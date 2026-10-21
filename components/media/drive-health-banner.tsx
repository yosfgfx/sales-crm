"use client";

import { useEffect, useState } from "react";
import type { TeamMember } from "@/data/media";
import { isAdministrator } from "@/lib/media-workflow";
import { ActionButton } from "./ui";

export default function DriveHealthBanner({ currentUser, onOpen }: { currentUser: TeamMember; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const admin = isAdministrator(currentUser);
  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    void fetch("/api/integrations/google", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((status: { connected?: boolean; lastCheckOk?: boolean | null } | null) => {
        if (!cancelled) setBroken(!!status?.connected && status.lastCheckOk === false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [admin]);
  if (!broken) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c98a] bg-[#fff6e8] p-4 text-sm text-[#7a4b00]">
      <span>
        انقطع ربط Google Drive، فتوقفت الأرشفة ومعاينة الملفات المؤرشفة. يعيد مالك النظام الربط من إعدادات الأرشيف، ثم تُستأنف الأرشفة.
      </span>
      <ActionButton className="!text-xs" onClick={onOpen}>
        فتح إعدادات Drive
      </ActionButton>
    </div>
  );
}

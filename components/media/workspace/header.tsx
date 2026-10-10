"use client";

import type { Dispatch, SetStateAction } from "react";
import type { MediaNotification, TeamMember } from "@/data/media";
import { ActionButton, Icon } from "../ui";
import { Avatar } from "./avatar";
import { navigation, type View } from "./shared";

type Setter<T> = Dispatch<SetStateAction<T>>;

export function WorkspaceHeader({
  view,
  query,
  setQuery,
  setMobileNav,
  setNotifications,
  setAccount,
  unread,
  currentUser,
}: {
  view: View;
  query: string;
  setQuery: Setter<string>;
  setMobileNav: Setter<boolean>;
  setNotifications: Setter<boolean>;
  setAccount: Setter<boolean>;
  unread: MediaNotification[];
  currentUser: TeamMember;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur-md lg:px-8">
      <div className="flex items-center gap-3">
        <ActionButton
          onClick={() => setMobileNav(true)}
          aria-label="فتح القائمة الرئيسية"
          className="size-10 px-0 lg:hidden"
        >
          <Icon name="list" />
        </ActionButton>
        <span className="hidden text-sm text-[var(--soft)] sm:block">
          مساحة العمل <span className="mx-3 text-[#bcc0cd]">/</span>
          <span className="text-[var(--foreground)]">
            {view === "admin"
              ? "إدارة النظام"
              : navigation.find((n) => n.id === view)?.label}
          </span>
        </span>
      </div>
      <div className="flex flex-1 items-center justify-end gap-3 sm:flex-initial">
        <label className="relative w-full max-w-[24em] sm:w-64">
          <span className="sr-only">ابحث في كل الأفكار والأعمال</span>
          <Icon
            name="search"
            className="absolute start-3 top-3 size-4 text-[var(--soft)]"
          />
          <input
            type="search"
            className="media-input !min-h-10 !border-transparent !bg-[var(--background)] !ps-10"
            placeholder="ابحث عن فكرة أو عمل…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <ActionButton
          onClick={() => setNotifications(true)}
          aria-label={`فتح الإشعارات، ${unread.length} غير مقروءة`}
          className="relative size-10 px-0 !shadow-none"
        >
          <Icon name="bell" />
          {unread.length > 0 && (
            <span className="absolute end-2 top-1.5 size-2 rounded-full bg-[var(--danger)] ring-2 ring-white" />
          )}
        </ActionButton>
        <div className="hidden h-7 w-px bg-[var(--border)] sm:block" />
        <ActionButton
          onClick={() => setAccount(true)}
          aria-label="إعدادات الحساب"
          className="size-10 !rounded-full p-0 !shadow-none"
        >
          <Avatar name={currentUser.name} />
        </ActionButton>
      </div>
    </header>
  );
}

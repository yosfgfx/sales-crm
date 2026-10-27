"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { MediaState } from "@/stores/media-store";
import {
  memberDisplayLabel,
  type MediaData,
  type MediaNotification,
  type TeamMember,
} from "@/data/media";
import ApiAccess from "../api-access";
import MfaSettings from "../mfa-settings";
import { ActionButton, EmptyState, Icon, Modal, formatDate } from "../ui";
import { Avatar } from "./avatar";
import { Icon3D, type Icon3DName } from "../engagement/icons-3d";
import { PersonAvatar } from "../engagement/person";
import { PushPrompt, forgetPushOnThisDevice } from "../engagement/push";
import type { View } from "./shared";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Run = (action: () => Promise<unknown>, message?: string) => Promise<void>;

const MINE: MediaNotification["type"][] = ["assignment", "approval", "feedback", "reminder", "quotation", "delivery", "honor", "achievement", "archive", "task"];
const TABS = [
  { id: "all", label: "الكل", match: (notice: MediaNotification) => !!notice },
  { id: "mine", label: "تخصني", match: (notice: MediaNotification) => MINE.includes(notice.type) },
  { id: "mentions", label: "الإشارات", match: (notice: MediaNotification) => notice.type === "mention" || notice.type === "chat" || notice.type === "comment" },
  { id: "meetings", label: "الاجتماعات", match: (notice: MediaNotification) => notice.type === "meeting" },
] as const;
const ICONS: Partial<Record<MediaNotification["type"], Icon3DName>> = { task: "check", meeting: "video", honor: "trophy", achievement: "trophy", approval: "check", assignment: "bolt", reminder: "bell", feedback: "note", mention: "chat", chat: "chat", quotation: "note", delivery: "check", archive: "calendar" };
const ACTIONS: Partial<Record<MediaNotification["type"], string>> = { task: "افتح المهمة", assignment: "افتح العمل", approval: "راجع الآن", feedback: "اعرض الملاحظات", meeting: "ادخل الغرفة", mention: "رد الآن", reminder: "افتح العمل", honor: "لوحة الشرف" };

function groupOf(iso: string, now: number) {
  const age = now - Date.parse(iso);
  if (age < 60 * 60_000) return "الآن";
  if (new Date(iso).toDateString() === new Date(now).toDateString()) return "اليوم";
  if (age < 7 * 86_400_000) return "هذا الأسبوع";
  return "أقدم";
}

export function NotificationsDialog({
  notifications,
  setNotifications,
  run,
  store,
  data,
  currentUser,
  onNavigateNotice,
}: {
  notifications: boolean;
  setNotifications: Setter<boolean>;
  run: Run;
  store: MediaState;
  data: MediaData;
  currentUser: TeamMember;
  onNavigateNotice: (notice: MediaNotification) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [now] = useState(() => Date.now());
  const mine = data.notifications.filter((n) => n.recipientId === currentUser.id);
  const active = TABS.find((item) => item.id === tab)!;
  const shown = mine.filter(active.match);
  const open = (n: MediaNotification) => {
    void run(() => store.markNotificationsRead([n.id]));
    onNavigateNotice(n);
    setNotifications(false);
  };
  const groups = shown.map((n) => groupOf(n.createdAt, now));
  return (
    <Modal
      open={notifications}
      onClose={() => setNotifications(false)}
      title="الإشعارات"
      description="كل حدث يهمك: الإسناد والاعتماد والإشارات والاجتماعات."
    >
      <div className="space-y-3.5 p-5">
        <div className="flex items-center justify-between gap-2">
          <div role="tablist" aria-label="تصنيف الإشعارات" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {TABS.map((item) => {
              const unread = mine.filter((n) => !n.read && item.match(n)).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${tab === item.id ? "bg-[#1D243C] text-white" : "bg-white text-[var(--foreground)] shadow-[0_0_0_1px_#E1E4EE]"}`}
                >
                  {item.label}
                  {unread > 0 && <span className={`rounded-md px-1.5 text-xs ${tab === item.id ? "bg-white/15" : "bg-[var(--accent)] text-[#5140B8]"}`}>{unread.toLocaleString("ar-SA")}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <PushPrompt currentUser={currentUser} compact />
        <div className="flex justify-end">
          <button type="button" className="min-h-10 rounded-lg px-2 text-sm font-medium text-[#5140B8] hover:bg-[var(--accent)]" onClick={() => void run(() => store.markNotificationsRead())}>
            تعليم الكل كمقروء
          </button>
        </div>
        {shown.length === 0 ? (
          <EmptyState title="أنت على اطلاع" description={tab === "all" ? "ستظهر إشعارات المهام والمراجعات هنا." : "لا توجد إشعارات في هذا القسم."} />
        ) : (
          <div className="space-y-2.5">
            {shown.map((n, index) => {
              const actor = data.members.find((member) => member.id === n.actorId);
              const heading = groups[index] !== groups[index - 1] ? groups[index] : "";
              const action = ACTIONS[n.type];
              return (
                <div key={n.id}>
                  {heading && <span className="mb-2 block pt-1 text-[13px] font-medium text-[var(--soft)]">{heading}</span>}
                  <div className={`flex items-start gap-3 rounded-[18px] bg-white p-3.5 ${!n.read ? "shadow-[0_0_0_2px_#6250D8]" : "shadow-[0_0_0_1px_#E8EAF2]"}`}>
                    {actor ? <PersonAvatar member={actor} /> : <Icon3D name={ICONS[n.type] || "bell"} className="size-10" />}
                    <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-start leading-relaxed">
                      <span className="block font-semibold">{n.title}</span>
                      <span className="mt-0.5 block text-sm break-words">{n.body}</span>
                      <span className="mt-1 block text-xs text-[var(--soft)]">{formatDate(n.createdAt)}</span>
                    </button>
                    {action && !n.read && (
                      <button type="button" onClick={() => open(n)} className="shrink-0 self-center rounded-xl bg-[#1D243C] px-3 py-2 text-xs font-medium text-white">
                        {action}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {store.olderNotifications && (
          <ActionButton onClick={() => void run(() => store.loadOlderNotifications())} className="w-full">
            عرض إشعارات أقدم
          </ActionButton>
        )}
        <p className="text-center text-xs text-[var(--soft)]">تُحذف الإشعارات المقروءة بعد 90 يوماً.</p>
      </div>
    </Modal>
  );
}

export function AccountDialog({
  account,
  setAccount,
  setSelected,
  setEditor,
  go,
  run,
  store,
  data,
  demo,
  currentUser,
}: {
  account: boolean;
  setAccount: Setter<boolean>;
  setSelected: Setter<string | null>;
  setEditor: Setter<boolean | string>;
  go: (next: View) => void;
  run: Run;
  store: MediaState;
  data: MediaData;
  demo: boolean;
  currentUser: TeamMember;
}) {
  return (
    <Modal
      open={account}
      onClose={() => setAccount(false)}
      title="حساب الفريق"
      description={
        demo
          ? "تبديل الحساب متاح في الوضع التجريبي لاستعراض الصلاحيات."
          : "صلاحياتك مرتبطة بحساب الفريق."
      }
    >
      <div className="space-y-5 p-6">
        <MfaSettings />
        {currentUser.role !== "admin" && currentUser.role !== "superadmin" && <ApiAccess compact />}
        <div className="flex items-center gap-3">
          <Avatar name={currentUser.name} />
          <div>
            <span className="block font-bold">{currentUser.name}</span>
            <span className="text-sm text-[var(--soft)]">
              {memberDisplayLabel(currentUser)}
            </span>
          </div>
        </div>
        {demo && (
          <label className="media-label">
            استعرض دورًا آخر
            <select
              className="media-input mt-2"
              value={currentUser.id}
              onChange={(e) =>
                void run(async () => {
                  await store.setCurrentUser(e.target.value);
                  setAccount(false);
                  setSelected(null);
                  setEditor(false);
                  go("overview");
                })
              }
            >
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {memberDisplayLabel(m)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!demo && (
          <ActionButton
            onClick={() =>
              void run(async () => {
                await forgetPushOnThisDevice();
                await fetch("/api/session", { method: "DELETE" });
                window.location.reload();
              })
            }
          >
            <Icon name="logout" />
            تسجيل الخروج
          </ActionButton>
        )}
        <p className="text-sm text-[var(--soft)]">
          تُحفظ الأفكار والملفات في مساحة عمل مشتركة، وتظهر التحديثات تلقائيًا
          للفريق.
        </p>
      </div>
    </Modal>
  );
}

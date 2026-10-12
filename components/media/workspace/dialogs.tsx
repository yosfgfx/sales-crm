"use client";

import type { Dispatch, SetStateAction } from "react";
import type { MediaState } from "@/stores/media-store";
import {
  memberDisplayLabel,
  type MediaData,
  type MediaNotification,
  type TeamMember,
} from "@/data/media";
import MfaSettings from "../mfa-settings";
import { ActionButton, EmptyState, Icon, Modal, formatDate } from "../ui";
import { Avatar } from "./avatar";
import type { View } from "./shared";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Run = (action: () => Promise<unknown>, message?: string) => Promise<void>;

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
  return (
    <Modal
      open={notifications}
      onClose={() => setNotifications(false)}
      title="إشعارات الفريق"
      description="إسناد المهام، وتحديثات الفريق، والتعليقات والإنجازات."
    >
      <div className="space-y-3 p-5">
        <ActionButton
          onClick={() => void run(() => store.markNotificationsRead())}
          className="w-full"
        >
          تحديد الكل كمقروء
        </ActionButton>
        {data.notifications.filter((n) => n.recipientId === currentUser.id)
          .length === 0 ? (
          <EmptyState
            title="أنت على اطلاع"
            description="ستظهر إشعارات المهام والمراجعات هنا."
          />
        ) : (
          data.notifications
            .filter((n) => n.recipientId === currentUser.id)
            .map((n) => (
              <ActionButton
                key={n.id}
                onClick={() => {
                  void run(() => store.markNotificationsRead([n.id]));
                  onNavigateNotice(n);
                  setNotifications(false);
                }}
                className={`h-auto w-full items-start justify-start gap-3 px-4 py-4 text-start !whitespace-normal ${!n.read ? "!bg-[var(--accent)]" : ""}`}
              >
                {n.actorName || n.actorId ? (
                  <Avatar
                    name={
                      n.actorName ||
                      data.members.find((member) => member.id === n.actorId)
                        ?.name ||
                      "عضو الفريق"
                    }
                  />
                ) : (
                  <Icon
                    name={n.type === "achievement" ? "trophy" : "bell"}
                    className="size-5"
                  />
                )}
                <span className="leading-relaxed">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="mt-1 block text-sm">{n.body}</span>
                  <span className="mt-1 block text-xs text-[var(--soft)]">
                    {formatDate(n.createdAt)}
                  </span>
                </span>
              </ActionButton>
            ))
        )}
        {store.olderNotifications && (
          <ActionButton
            onClick={() => void run(() => store.loadOlderNotifications())}
            className="w-full"
          >
            عرض إشعارات أقدم
          </ActionButton>
        )}
        <p className="text-center text-xs text-[var(--soft)]">
          تُحذف الإشعارات المقروءة بعد 90 يوماً.
        </p>
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

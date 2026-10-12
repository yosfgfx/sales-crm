"use client";

import { useId, useState } from "react";
import { SOCIAL_EMOJIS, type SocialMessage } from "@/data/social";
import { memberDisplayLabel, type TeamMember } from "@/data/media";
import { isAdministrator } from "@/lib/media-workflow";
import { ActionButton, Icon, Modal, errorText } from "../ui";
import { Avatar } from "../workspace/avatar";
import { VoicePlayer } from "./voice-recorder";
import { socialAction, socialRequest } from "./api";

const stamp = (at: string) =>
  new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
export function MessageList({
  messages,
  currentUser,
  members,
  onChange,
  onReply,
  compact,
}: {
  messages: SocialMessage[];
  currentUser: TeamMember;
  members: TeamMember[];
  onChange: (message: SocialMessage) => void;
  onReply?: (message: SocialMessage) => void;
  compact?: boolean;
}) {
  const listId = useId();
  const [picker, setPicker] = useState<string | null>(null),
    [deleting, setDeleting] = useState<SocialMessage | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const action = async (
    message: SocialMessage,
    operation:
      | { operation: "reaction"; emoji: string }
      | { operation: "pin"; pinned: boolean },
  ) => {
    setBusy(message.id);
    setError("");
    try {
      const result = await socialAction(message.id, operation);
      onChange(result.message);
      setPicker(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    setError("");
    try {
      const result = await socialRequest<{ message: SocialMessage }>(
        `/api/social/${encodeURIComponent(deleting.id)}`,
        { method: "DELETE" },
      );
      onChange(result.message);
      setDeleting(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-[var(--danger)]">
        {error}
      </p>
      <ol aria-label="الرسائل" className="space-y-4">
        {messages.map((message) => {
          const own = message.authorId === currentUser.id,
            member = members.find((item) => item.id === message.authorId);
          return (
            <li
              key={message.id}
              id={`${listId}-message-${message.id}`}
              className={own ? "ps-0 sm:pe-8" : "ps-0 sm:ps-8"}
            >
              <article
                className={`min-w-0 rounded-2xl p-4 ${own ? "bg-[var(--accent)]" : "border border-[var(--border)] bg-white"}`}
                aria-label={`رسالة ${message.authorName}`}
              >
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={message.authorName} />
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold break-words">
                        {message.authorName}
                        {own && (
                          <span className="ms-1 font-normal text-[var(--soft)]">
                            · أنت
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-[var(--soft)]">
                        {member ? memberDisplayLabel(member) : "عضو الفريق"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--soft)]">
                    {message.pinnedAt && (
                      <span className="flex items-center gap-1 font-semibold text-[var(--primary)]">
                        <Icon name="pin" className="size-3.5" />
                        مثبّتة
                      </span>
                    )}
                    <time dateTime={message.createdAt}>
                      {stamp(message.createdAt)}
                    </time>
                  </div>
                </header>
                {message.deletedAt ? (
                  <p className="mt-3 text-sm text-[var(--soft)]">
                    حُذفت هذه الرسالة.
                  </p>
                ) : (
                  <>
                    <p
                      dir="auto"
                      className="mt-3 text-sm leading-7 break-words whitespace-pre-wrap"
                    >
                      {message.text}
                    </p>
                    {message.voice && (
                      <div className="mt-3 rounded-xl bg-white/70 p-3">
                        <VoicePlayer
                          url={message.voice.url}
                          durationMs={message.voice.durationSeconds * 1000}
                        />
                      </div>
                    )}
                    {message.mentions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {message.mentions.map((id) => (
                          <span
                            key={id}
                            className="rounded-md bg-white/70 px-2 py-1 text-[11px] text-[var(--primary)]"
                          >
                            @
                            {members.find((item) => item.id === id)?.name ||
                              "زميل"}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <footer className="mt-3 flex flex-wrap items-center gap-2">
                  {!message.deletedAt &&
                    message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        disabled={busy === message.id}
                        aria-pressed={reaction.memberIds.includes(
                          currentUser.id,
                        )}
                        aria-label={`${reaction.emoji} · ${reaction.count} تفاعل${reaction.memberIds.includes(currentUser.id) ? " · تفاعلت بها" : ""}`}
                        title={reaction.memberIds
                          .map(
                            (id) =>
                              members.find((item) => item.id === id)?.name ||
                              "عضو",
                          )
                          .join("، ")}
                        className={`min-h-10 rounded-xl border px-3 text-sm ${reaction.memberIds.includes(currentUser.id) ? "border-[var(--primary)] bg-white text-[var(--primary)]" : "border-[var(--border)] bg-white/60"}`}
                        onClick={() =>
                          void action(message, {
                            operation: "reaction",
                            emoji: reaction.emoji,
                          })
                        }
                      >
                        {reaction.emoji}{" "}
                        <span className="text-xs">
                          {reaction.count.toLocaleString("ar-SA")}
                        </span>
                      </button>
                    ))}
                  {!message.deletedAt && (
                    <ActionButton
                      className="!bg-transparent !px-2 !text-xs !shadow-none"
                      disabled={busy === message.id}
                      aria-expanded={picker === message.id}
                      aria-label={`إضافة تفاعل على رسالة ${message.authorName}`}
                      onClick={() =>
                        setPicker(picker === message.id ? null : message.id)
                      }
                    >
                      تفاعل
                    </ActionButton>
                  )}
                  {onReply &&
                    (!message.deletedAt || message.replyCount > 0) && (
                      <ActionButton
                        className="!bg-transparent !px-2 !text-xs !shadow-none"
                        onClick={() => onReply(message)}
                      >
                        <Icon name="reply" className="size-3.5" />
                        {message.replyCount
                          ? `${message.replyCount.toLocaleString("ar-SA")} رد`
                          : "رد"}
                      </ActionButton>
                    )}
                  {!message.deletedAt &&
                    isAdministrator(currentUser) &&
                    !message.parentId && (
                      <ActionButton
                        className="!bg-transparent !px-2 !text-xs !shadow-none"
                        disabled={busy === message.id}
                        onClick={() =>
                          void action(message, {
                            operation: "pin",
                            pinned: !message.pinnedAt,
                          })
                        }
                      >
                        <Icon name="pin" className="size-3.5" />
                        {message.pinnedAt ? "إلغاء التثبيت" : "تثبيت"}
                      </ActionButton>
                    )}
                  {!message.deletedAt &&
                    (own || isAdministrator(currentUser)) && (
                      <ActionButton
                        className="ms-auto !bg-transparent !px-2 !text-xs !text-[var(--danger)] !shadow-none"
                        aria-label={`حذف رسالة ${message.authorName}`}
                        onClick={() => {
                          setDeleting(message);
                          setError("");
                        }}
                      >
                        <Icon name="trash" className="size-3.5" />
                        {!compact && "حذف"}
                      </ActionButton>
                    )}
                </footer>
                {picker === message.id && (
                  <div
                    className="mt-3 flex flex-wrap gap-1 rounded-xl bg-white p-2"
                    aria-label="اختر تفاعلًا"
                  >
                    {SOCIAL_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        disabled={busy === message.id}
                        aria-label={`التفاعل بـ ${emoji}`}
                        className="flex size-10 items-center justify-center rounded-lg text-xl hover:bg-[var(--accent)]"
                        onClick={() =>
                          void action(message, { operation: "reaction", emoji })
                        }
                      >
                        {emoji}
                      </button>
                    ))}
                    <ActionButton
                      className="!px-2 !text-xs"
                      onClick={() => setPicker(null)}
                    >
                      إغلاق
                    </ActionButton>
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
      <Modal
        open={!!deleting}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        locked={!!busy}
        title="حذف الرسالة"
        description="ستظهر عبارة تفيد بحذف الرسالة. تبقى الردود وسجل المحادثة محفوظة."
      >
        <div className="space-y-4 p-6">
          <p className="text-sm text-[var(--soft)]">
            هل تريد حذف هذه الرسالة من المحادثة؟
          </p>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <ActionButton disabled={!!busy} onClick={() => setDeleting(null)}>
              إلغاء
            </ActionButton>
            <ActionButton
              disabled={!!busy}
              className="!bg-[var(--danger)] !text-white"
              onClick={() => void remove()}
            >
              {busy ? "جارٍ الحذف…" : "حذف الرسالة"}
            </ActionButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { TeamMember } from "@/data/media";
import type { SocialContext, SocialMessage, SocialVoice } from "@/data/social";
import { ActionButton, Icon, errorText } from "../ui";
import { socialRequest, unavailableContext } from "./api";
import { VoiceRecorder, type VoiceDraft } from "./voice-recorder";

export function MessageComposer({
  context,
  members,
  currentUser,
  parentId,
  onSent,
  onCancelReply,
  onUnavailable,
}: {
  context: SocialContext;
  members: TeamMember[];
  currentUser: TeamMember;
  parentId?: string;
  onSent: (message: SocialMessage) => void;
  onCancelReply?: () => void;
  onUnavailable?: (message: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(""),
    [voice, setVoice] = useState<VoiceDraft | null>(null),
    [mentions, setMentions] = useState<string[]>([]),
    [mentionQuery, setMentionQuery] = useState(""),
    [showMentions, setShowMentions] = useState(false),
    [busy, setBusy] = useState(false),
    [voiceActive, setVoiceActive] = useState(false),
    [error, setError] = useState("");
  const uploaded = useRef<{ voice: SocialVoice; blob: Blob } | null>(null),
    input = useRef<HTMLTextAreaElement | null>(null),
    mounted = useRef(true),
    sending = useRef(false),
    attempt = useRef<{ signature: string; nonce: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const pending = uploaded.current;
      if (pending)
        void fetch(pending.voice.url, { method: "DELETE", keepalive: true });
    };
  }, []);
  const changeVoice = (draft: VoiceDraft | null) => {
    if (uploaded.current && uploaded.current.blob !== draft?.blob) {
      void fetch(uploaded.current.voice.url, {
        method: "DELETE",
        keepalive: true,
      });
      uploaded.current = null;
    }
    setVoice(draft);
  };
  const addMention = (member: TeamMember) => {
    const token = `@${member.name}`;
    setText((value) => `${value.trimEnd()}${value.trim() ? " " : ""}${token} `);
    setMentions((ids) => [...new Set([...ids, member.id])]);
    setShowMentions(false);
    setMentionQuery("");
    input.current?.focus();
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || sending.current) return;
    setError("");
    if (voiceActive) {
      setError("أوقف التسجيل وعاينه قبل إرسال الرسالة.");
      return;
    }
    if (!text.trim() && !voice) {
      setError("اكتب رسالة أو سجّل مقطعًا صوتيًا قبل الإرسال.");
      input.current?.focus();
      return;
    }
    if (text.trim().length > 4000) {
      setError("اختصر الرسالة إلى ٤٠٠٠ حرف أو أقل.");
      input.current?.focus();
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      let voiceId: string | undefined;
      if (voice) {
        if (uploaded.current?.blob !== voice.blob) {
          const form = new FormData();
          const extension = voice.mime.includes("ogg")
            ? "ogg"
            : voice.mime.includes("mp4")
              ? "m4a"
              : "webm";
          form.append("file", voice.blob, `voice.${extension}`);
          form.set("durationSeconds", String(voice.durationMs / 1000));
          const result = await socialRequest<{ voice: SocialVoice }>(
            "/api/social/voice",
            { method: "POST", body: form },
          );
          uploaded.current = { voice: result.voice, blob: voice.blob };
          if (!mounted.current) {
            void fetch(result.voice.url, { method: "DELETE", keepalive: true });
            uploaded.current = null;
            return;
          }
        }
        voiceId = uploaded.current?.voice.id;
      }
      const mentionIds = mentions.filter((memberId) => {
        const member = members.find(
          (item) => item.id === memberId && item.active,
        );
        return member && text.includes(`@${member.name}`);
      });
      const signature = JSON.stringify({
        ...context,
        text: text.trim(),
        mentionIds,
        voiceId,
        parentId,
      });
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, nonce: crypto.randomUUID() };
      const result = await socialRequest<{ message: SocialMessage }>(
        "/api/social",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...context,
            text: text.trim(),
            mentionIds,
            clientNonce: attempt.current.nonce,
            ...(voiceId ? { voiceId } : {}),
            ...(parentId ? { parentId } : {}),
          }),
        },
      );
      uploaded.current = null;
      attempt.current = null;
      if (mounted.current) {
        setText("");
        setVoice(null);
        setMentions([]);
        setShowMentions(false);
        onSent(result.message);
        input.current?.focus();
      }
    } catch (err) {
      if (mounted.current) {
        setError(errorText(err));
        if (unavailableContext(err)) onUnavailable?.(errorText(err));
      }
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(event) => void send(event)}
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4"
      aria-label={parentId ? "كتابة رد" : "كتابة رسالة"}
    >
      <label htmlFor={`${id}-text`} className="media-label">
        {parentId ? "ردك" : "شارك الفريق"}
      </label>
      <textarea
        ref={input}
        id={`${id}-text`}
        rows={3}
        maxLength={4000}
        disabled={busy}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className="media-input resize-y !text-base"
        placeholder={
          parentId ? "اكتب ردًا واضحًا…" : "سؤال، فكرة سريعة، أو تهنئة لزميل…"
        }
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ActionButton
          type="button"
          disabled={busy}
          aria-expanded={showMentions}
          aria-controls={`${id}-mentions`}
          className="!px-3 !text-xs"
          onClick={() => setShowMentions(!showMentions)}
        >
          @ الإشارة لزميل
        </ActionButton>
        <span id={`${id}-hint`} className="text-xs text-[var(--soft)]">
          إرسال بـ Ctrl + Enter · {(4000 - text.length).toLocaleString("ar-SA")}{" "}
          حرف متبقٍ
        </span>
      </div>
      {showMentions && (
        <div
          id={`${id}-mentions`}
          className="space-y-2 rounded-xl bg-[var(--background)] p-3"
        >
          <label className="media-label">
            البحث عن زميل
            <input
              type="search"
              className="media-input mt-2"
              value={mentionQuery}
              onChange={(event) => setMentionQuery(event.target.value)}
            />
          </label>
          <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
            {members
              .filter(
                (member) =>
                  member.active &&
                  member.id !== currentUser.id &&
                  member.name.includes(mentionQuery),
              )
              .map((member) => (
                <ActionButton
                  key={member.id}
                  type="button"
                  className="!px-3 !text-xs"
                  onClick={() => addMention(member)}
                >
                  {member.name}
                </ActionButton>
              ))}
          </div>
        </div>
      )}
      {mentions.filter((memberId) =>
        text.includes(
          `@${members.find((member) => member.id === memberId)?.name}`,
        ),
      ).length > 0 && (
        <p className="text-xs text-[var(--primary)]">
          سيصل إشعار للزملاء المشار إليهم عند الإرسال.
        </p>
      )}
      <VoiceRecorder
        draft={voice}
        onChange={changeVoice}
        onRecordingChange={setVoiceActive}
        disabled={busy}
      />
      <p
        id={`${id}-error`}
        role="alert"
        className="text-sm text-[var(--danger)]"
      >
        {error}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--soft)]">
          {voiceActive
            ? "أوقف التسجيل وعاينه قبل الإرسال."
            : "التسجيل يبقى على جهازك حتى تضغط إرسال."}
        </p>
        <div className="flex gap-2">
          {onCancelReply && (
            <ActionButton type="button" disabled={busy} onClick={onCancelReply}>
              إغلاق الردود
            </ActionButton>
          )}
          <ActionButton primary type="submit" disabled={busy || voiceActive}>
            <Icon name="send" className="size-4" />
            {busy ? "جارٍ الإرسال…" : parentId ? "إرسال الرد" : "إرسال"}
          </ActionButton>
        </div>
      </div>
    </form>
  );
}

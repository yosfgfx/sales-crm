"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "../ui";

export interface VoiceDraft {
  blob: Blob;
  url: string;
  durationMs: number;
  mime: string;
}
const MAX_SECONDS = 120;
const MAX_BYTES = 1024 * 1024;
export function voiceTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

/** Recording stays on this device until the composer explicitly sends it. */
export function VoiceRecorder({
  draft,
  onChange,
  onRecordingChange,
  disabled,
}: {
  draft: VoiceDraft | null;
  onChange: (draft: VoiceDraft | null) => void;
  onRecordingChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false),
    [requesting, setRequesting] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    started = useRef(0),
    cancelled = useRef(false),
    generation = useRef(0),
    mounted = useRef(true),
    previewUrl = useRef<string | null>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onRecordingChange?.(recording || requesting);
  }, [recording, requesting, onRecordingChange]);
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const discard = () => {
    generation.current += 1;
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    changed.current(null);
    setRecording(false);
    setRequesting(false);
    setElapsed(0);
  };
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden && recorder.current?.state === "recording")
        recorder.current.stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      mounted.current = false;
      generation.current += 1;
      cancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopTracks();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (!draft && previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  }, [draft]);
  const start = async () => {
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "التسجيل الصوتي غير متاح في هذا المتصفح. يمكنك إرسال رسالة نصية، أو فتح النظام في متصفح حديث باتصال آمن.",
      );
      return;
    }
    const mime = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
    ].find((value) => MediaRecorder.isTypeSupported(value));
    if (!mime) {
      setError(
        "هذا المتصفح لا يدعم التسجيل الصوتي المضغوط. جرّب Chrome أو Edge لإرسال تسجيل قصير.",
      );
      return;
    }
    const requestId = ++generation.current;
    setRequesting(true);
    cancelled.current = false;
    try {
      const captured = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (!mounted.current || requestId !== generation.current) {
        captured.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = captured;
      chunks.current = [];
      started.current = performance.now();
      setElapsed(0);
      const active = new MediaRecorder(captured, {
        mimeType: mime,
        audioBitsPerSecond: 16000,
      });
      recorder.current = active;
      active.ondataavailable = (event) => {
        if (requestId !== generation.current) return;
        if (event.data.size) chunks.current.push(event.data);
        if (
          chunks.current.reduce((sum, chunk) => sum + chunk.size, 0) > MAX_BYTES
        ) {
          cancelled.current = true;
          if (active.state === "recording") active.stop();
          if (mounted.current)
            setError(
              "تجاوز التسجيل الحجم المسموح. سجّل رسالة أقصر ثم أعد المحاولة.",
            );
        }
      };
      active.onerror = () => {
        if (requestId !== generation.current) return;
        cancelled.current = true;
        stopTracks();
        if (mounted.current) {
          setRecording(false);
          setError("توقف التسجيل بسبب مشكلة في الميكروفون. أعد المحاولة.");
        }
      };
      active.onstop = () => {
        if (requestId !== generation.current) return;
        const durationMs = Math.min(
          MAX_SECONDS * 1000,
          Math.round(performance.now() - started.current),
        );
        stopTracks();
        if (!mounted.current) return;
        setRecording(false);
        if (cancelled.current) return;
        const blob = new Blob(chunks.current, { type: mime });
        if (!blob.size || blob.size > MAX_BYTES || durationMs < 300) {
          setError(
            "التسجيل قصير جدًا أو أكبر من الحجم المسموح. سجّل رسالتك مجددًا.",
          );
          return;
        }
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        const url = URL.createObjectURL(blob);
        previewUrl.current = url;
        changed.current({ blob, url, durationMs, mime });
      };
      active.start(1000);
      setRecording(true);
      timer.current = setInterval(() => {
        const seconds = Math.floor(
          (performance.now() - started.current) / 1000,
        );
        if (mounted.current) setElapsed(seconds);
        if (
          performance.now() - started.current >= MAX_SECONDS * 1000 - 250 &&
          active.state === "recording"
        )
          active.stop();
      }, 250);
    } catch (err) {
      stopTracks();
      if (mounted.current && requestId === generation.current)
        setError(
          err instanceof DOMException &&
            ["NotAllowedError", "SecurityError"].includes(err.name)
            ? "لم يُسمح باستخدام الميكروفون. فعّل إذنه من المتصفح عند رغبتك بالتسجيل، أو أرسل رسالة نصية."
            : "تعذر الوصول إلى الميكروفون. تأكد من توصيله ومن أنه غير مستخدم في تطبيق آخر.",
        );
    } finally {
      if (mounted.current && requestId === generation.current)
        setRequesting(false);
    }
  };
  return (
    <div className="space-y-2">
      {draft ? (
        <div className="rounded-xl bg-[var(--background)] p-3">
          <span className="mb-2 block text-xs text-[var(--soft)]">
            معاينة التسجيل · لم يُرسل بعد
          </span>
          <VoicePlayer url={draft.url} durationMs={draft.durationMs} />
          <ActionButton
            disabled={disabled}
            className="mt-2 !px-3 !text-xs"
            onClick={discard}
          >
            حذف التسجيل
          </ActionButton>
        </div>
      ) : recording ? (
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="status"
            className="flex items-center gap-2 text-sm text-[var(--danger)]"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-current"
            />{" "}
            جارٍ التسجيل{" "}
            <bdi className="tabular-nums">{voiceTime(elapsed)} / 2:00</bdi>
          </span>
          <ActionButton onClick={() => recorder.current?.stop()}>
            إيقاف ومعاينة
          </ActionButton>
          <ActionButton onClick={discard}>إلغاء التسجيل</ActionButton>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            disabled={disabled || requesting}
            onClick={() => void start()}
          >
            {requesting ? "جارٍ طلب إذن الميكروفون…" : "تسجيل صوتي"}
          </ActionButton>
          {requesting && <ActionButton onClick={discard}>إلغاء</ActionButton>}
          <span className="text-xs text-[var(--soft)]">
            دقيقتان كحد أقصى · صوت مضغوط
          </span>
        </div>
      )}
      <p role="alert" className="text-xs text-[var(--danger)]">
        {error}
      </p>
    </div>
  );
}

/** Explicit duration makes recorded WebM playable even when browser metadata says Infinity. */
export function VoicePlayer({
  url,
  durationMs,
}: {
  url: string;
  durationMs: number;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [error, setError] = useState("");
  const resolvingDuration = useRef(false),
    resumeAfterFix = useRef(false);
  const duration = Math.max(0.3, durationMs / 1000);
  return (
    <div className="min-w-0">
      <audio
        ref={audio}
        controls
        preload="none"
        src={url}
        aria-label="تسجيل صوتي"
        className="h-11 w-full max-w-full"
        onLoadedMetadata={() => {
          const player = audio.current;
          if (player && !Number.isFinite(player.duration)) {
            resolvingDuration.current = true;
            resumeAfterFix.current = !player.paused;
            player.currentTime = 1e101;
          }
        }}
        onTimeUpdate={() => {
          const player = audio.current;
          if (
            player &&
            resolvingDuration.current &&
            Number.isFinite(player.duration)
          ) {
            resolvingDuration.current = false;
            player.currentTime = 0;
            if (resumeAfterFix.current)
              void player
                .play()
                .catch(() => setError("اضغط تشغيل للاستماع إلى التسجيل."));
          }
        }}
        onError={() =>
          setError(
            "تعذر تحميل التسجيل الصوتي. تحقق من الاتصال ثم أعد المحاولة.",
          )
        }
      />
      <span className="mt-1 block text-xs text-[var(--soft)]">
        مدة التسجيل <bdi>{voiceTime(duration)}</bdi>
      </span>
      <p role="alert" className="text-xs text-[var(--danger)]">
        {error}
      </p>
    </div>
  );
}

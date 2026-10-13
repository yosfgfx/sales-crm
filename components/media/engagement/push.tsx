"use client";

import { useEffect, useState } from "react";
import { addressed } from "@/data/engagement";
import type { TeamMember } from "@/data/media";
import { useEngagement } from "@/stores/engagement-store";
import { errorText } from "../ui";
import { Icon3D } from "./icons-3d";

type Support = "checking" | "unsupported" | "ios-install" | "denied" | "ready" | "subscribed";

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export function usePushSupport() {
  const [support, setSupport] = useState<Support>("checking");
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone ? "ios-install" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      const existing = await (await registration()).pushManager.getSubscription();
      return existing && Notification.permission === "granted" ? "subscribed" : "ready";
    };
    void check().then((value) => !cancelled && setSupport(value as Support), () => !cancelled && setSupport("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);
  return [support, setSupport] as const;
}

export function PushPrompt({ currentUser, compact = false }: { currentUser: TeamMember; compact?: boolean }) {
  const { state, act } = useEngagement();
  const [support, setSupport] = usePushSupport();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const key = state?.push.publicKey;
  const f = currentUser.addressForm;
  useEffect(() => {
    if (support !== "subscribed" || !key || !state || state.push.subscribed > 0) return;
    void (async () => {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) await act({ action: "subscribePush", subscription: subscription.toJSON() }, { reload: false });
    })().catch(() => undefined);
  }, [support, key, state, act]);
  if (!key || support === "checking" || support === "unsupported" || (support === "subscribed" && compact)) return null;
  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(permission === "denied" ? "denied" : "ready");
        return;
      }
      const worker = await registration();
      await navigator.serviceWorker.ready;
      const subscription = (await worker.pushManager.getSubscription()) || (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      await act({ action: "subscribePush", subscription: subscription.toJSON() });
      setSupport("subscribed");
      setMessage("تم! بتوصلك التنبيهات على هذا الجهاز.");
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) {
        await act({ action: "unsubscribePush", endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSupport("ready");
      setMessage("أوقفت إشعارات هذا الجهاز.");
    } catch (cause) {
      setMessage(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[18px] bg-[#EEEBFC] p-3.5">
      <Icon3D name="bell" className="size-9" />
      <span className="min-w-0 flex-1 text-sm text-[#3F2FA0]">
        {support === "subscribed"
          ? "إشعارات الجوال مفعّلة على هذا الجهاز."
          : support === "denied"
            ? "الإشعارات محظورة في إعدادات المتصفح. فعّلها من إعدادات الموقع ثم أعد المحاولة."
            : support === "ios-install"
              ? addressed(f, "على الآيفون: أضف وصل إلى الشاشة الرئيسية من زر المشاركة، ثم افتحه منها وفعّل الإشعارات.", "على الآيفون: أضيفي وصل إلى الشاشة الرئيسية من زر المشاركة، ثم افتحيه منها وفعّلي الإشعارات.")
              : addressed(f, "فعّل إشعارات الجوال حتى يصلك الإسناد والاعتماد والاجتماعات فوراً.", "فعّلي إشعارات الجوال حتى يصلك الإسناد والاعتماد والاجتماعات فوراً.")}
        {message && <span role="status" className="mt-1 block text-xs">{message}</span>}
      </span>
      {support === "ready" && (
        <button type="button" disabled={busy} onClick={() => void enable()} className="min-h-11 rounded-xl bg-[var(--primary)] px-4 font-medium text-white hover:bg-[#5140b8]">
          {busy ? "جارٍ التفعيل…" : "تفعيل"}
        </button>
      )}
      {support === "subscribed" && !compact && (
        <button type="button" disabled={busy} onClick={() => void disable()} className="min-h-11 rounded-xl bg-white px-4 text-sm text-[#3F2FA0] shadow-[0_0_0_1px_#D9D3FA]">
          إيقاف على هذا الجهاز
        </button>
      )}
    </div>
  );
}

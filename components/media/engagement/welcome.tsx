"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MediaData, TeamMember } from "@/data/media";
import { addressed } from "@/data/engagement";
import { useEngagement } from "@/stores/engagement-store";
import { Icon3D } from "./icons-3d";
import { PersonAvatar } from "./person";
import { arNum, firstName, greeting, nextStep, relativeTime, riyadhDay } from "./format";

const EASE = [0.25, 1, 0.5, 1] as const;
const CLOSED = ["delivered", "cancelled", "rejected"];

export function Welcome({ data, currentUser, onOpenIdea }: { data: MediaData; currentUser: TeamMember; onOpenIdea: (id: string) => void }) {
  const { state, act } = useEngagement();
  const reduce = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const show = !!state?.welcome.show && !closing;
  const f = currentUser.addressForm;
  const today = riyadhDay();
  const content = useMemo(() => {
    if (!state) return null;
    const since = state.welcome.previousVisitAt;
    const notices = data.notifications
      .filter((notice) => notice.recipientId === currentUser.id && (!since || notice.createdAt > since) && notice.type !== "activity")
      .slice(0, 3);
    const mine = data.ideas.filter((idea) => !idea.deletedAt && !CLOSED.includes(idea.status) && (idea.ownerId === currentUser.id || idea.designerId === currentUser.id)).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    const top = mine[0];
    const recent = data.ideas
      .filter((idea) => idea.status === "delivered" && idea.deliveredAt && (idea.designerId === currentUser.id || idea.ownerId === currentUser.id))
      .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""))[0];
    const meeting = state.meetings.find((item) => item.status !== "cancelled" && item.status !== "ended" && riyadhDay(new Date(item.startsAt)) === today);
    return { notices, top, recent, meeting };
  }, [state, data, currentUser.id, today]);
  const evening = greeting() === "مساء الخير";
  const dismiss = () => {
    setClosing(true);
    void act({ action: "dismissWelcome" }, { reload: false }).catch(() => undefined);
  };
  return (
    <AnimatePresence>
      {show && content && (
        <motion.div
          key="welcome"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
          onKeyDown={(event) => event.key === "Escape" && dismiss()}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0E1222]/55 p-0 backdrop-blur-sm sm:p-6"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: EASE } }}
        >
          <motion.div
            className="relative flex h-full w-full flex-col gap-5 overflow-y-auto bg-[radial-gradient(120%_70%_at_85%_0%,#5B4BD0_0%,#2A2F63_45%,#1D243C_100%)] px-6 pt-10 pb-7 text-white sm:h-auto sm:max-h-[92dvh] sm:max-w-[30em] sm:rounded-[32px] sm:shadow-[0_40px_90px_rgb(14_18_34/0.45)]"
            initial={reduce ? false : { scale: 1.12, opacity: 0, filter: "blur(14px)", rotateX: 8 }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)", rotateX: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: -30, filter: "blur(8px)" }}
            transition={{ duration: 0.9, ease: EASE }}
            style={{ transformPerspective: 1200 }}
          >
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -top-28 -end-24 size-80 rounded-full bg-[radial-gradient(circle,#F2A33A40,transparent_65%)]"
              animate={reduce ? undefined : { x: [0, -18, 0], y: [0, 14, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div initial={reduce ? false : { y: -30, rotate: -20, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}>
              <Icon3D name={evening ? "moon" : "sun"} className="size-[76px]" />
            </motion.div>
            <Stagger index={1}>
              <span className="text-[#C9C4F5]">
                {new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", weekday: "long" }).format(new Date())}
                {content.meeting ? " · يوم العمل عن بعد" : ""}
              </span>
              <h1 id="welcome-title" className="font-display !text-[38px] !font-medium !leading-tight text-white">
                {greeting()} يا {firstName(currentUser.name)}
              </h1>
              <p className="text-[17px] text-[#E3E1FA]">
                {content.recent
                  ? `${addressed(f, "سلّمت", "سلّمتِ")} «${content.recent.title}» ${content.recent.dueDate && content.recent.deliveredAt! < content.recent.dueDate ? "قبل موعدها" : "في وقتها"}. ${(state?.streak || 0) > 1 ? "بداية قوية تستاهل نكمّل عليها." : "خطوة جميلة نبني عليها اليوم."}`
                  : addressed(f, "يوم جديد وفرصة لأثر جديد. خلنا نرتّب يومك.", "يوم جديد وفرصة لأثر جديد. خلينا نرتّب يومك.")}
              </p>
            </Stagger>
            {(content.notices.length > 0 || content.meeting) && (
              <Stagger index={2}>
                <div className="flex flex-col gap-3 rounded-[22px] border border-white/15 bg-white/10 p-4.5">
                  <strong className="text-[15px] text-[#E3E1FA]">منذ آخر زيارة</strong>
                  {content.notices.map((notice) => {
                    const actor = data.members.find((member) => member.id === notice.actorId);
                    return (
                      <div key={notice.id} className="flex items-center gap-3">
                        {actor ? <PersonAvatar member={actor} size="sm" showPresence={false} /> : <Icon3D name="bell" className="size-8" />}
                        <span className="min-w-0 text-sm">
                          {notice.title}
                          <span className="block truncate text-xs text-[#C9C4F5]">{notice.body} · {relativeTime(notice.createdAt)}</span>
                        </span>
                      </div>
                    );
                  })}
                  {content.meeting && (
                    <div className="flex items-center gap-3">
                      <Icon3D name="video" className="size-8" />
                      <span className="text-sm">
                        {content.meeting.title} اليوم {new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }).format(new Date(content.meeting.startsAt))}
                        {content.meeting.items.some((item) => item.kind === "agenda") && `، ${arNum(content.meeting.items.filter((item) => item.kind === "agenda").length)} بنود`}
                      </span>
                    </div>
                  )}
                </div>
              </Stagger>
            )}
            {content.top && (
              <Stagger index={3}>
                <button type="button" onClick={() => { dismiss(); onOpenIdea(content.top!.id); }} className="flex w-full flex-col gap-1.5 rounded-[22px] bg-white p-4.5 text-start text-[#20273C] transition-transform duration-300 ease-power3-out hover:-translate-y-0.5">
                  <span className="text-[13px] text-[#4A5468]">أهم شيء اليوم</span>
                  <strong className="text-[19px]">{content.top.title}</strong>
                  <span className="text-sm text-[#4A5468]">{content.top.dueDate === today ? "موعدها اليوم · " : ""}{nextStep(content.top, currentUser)}</span>
                </button>
              </Stagger>
            )}
            <Stagger index={4} className="mt-auto flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                autoFocus
                onClick={dismiss}
                className="flex min-h-14 items-center justify-center rounded-[18px] bg-[#F2A33A] text-[17px] font-bold text-[#1D243C] transition-[transform,background-color] duration-200 ease-power3-out hover:bg-[#f6b558] active:scale-[0.97]"
              >
                {addressed(f, "ابدأ يومك", "ابدئي يومك")}
              </button>
              {(state?.streak || 0) > 1 && (
                <span className="text-center text-[13px] text-[#C9C4F5]">
                  {arNum(state!.streak)} أيام نشاط متتالية. {addressed(f, "حافظ عليها اليوم.", "حافظي عليها اليوم.")}
                </span>
              )}
            </Stagger>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stagger({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className || "flex flex-col gap-1.5"}
      initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.75, ease: EASE, delay: 0.35 + index * 0.11 }}
    >
      {children}
    </motion.div>
  );
}

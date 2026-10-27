"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { WORK_TYPE_LABELS, ideaCompanyLabel, type Idea, type MediaData, type TeamMember } from "@/data/media";
import { addressed, type EngagementState, type Meeting } from "@/data/engagement";
import { isOnline, useTeamPresence } from "@/stores/team-presence";
import { useEngagement } from "@/stores/engagement-store";
import { ActionButton, errorText } from "../ui";
import { Icon3D } from "./icons-3d";
import { PersonAvatar, useOnline } from "./person";
import { SmartAdd, TaskRow } from "./tasks";
import { AGENDA, STAGES, WORKS, addDays, arNum, plural, streakText, clock, daysBetween, dueText, firstName, greeting, isWorkDay, minutesText, nextStep, relativeTime, riyadhDay, stageIndex } from "./format";

const EASE = [0.25, 1, 0.5, 1] as const;
const CLOSED = ["delivered", "cancelled", "rejected"];
const FOCUS_COLORS = ["#6250D8", "#1E9C8F", "#E8962E", "#C23A55", "#2F6FD6", "#7A8299"];
type Filter = "late" | "today" | "week";

function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18, scale: 0.985, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: EASE, delay: index * 0.06 }}
    >
      {children}
    </motion.div>
  );
}

function PlanRing({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  const radius = 56, length = 2 * Math.PI * radius;
  return (
    <div className="relative size-[132px] shrink-0" role="img" aria-label={`${arNum(value)}٪ ${label}`}>
      <svg viewBox="0 0 132 132" className="size-full -rotate-90">
        <circle cx="66" cy="66" r={radius} fill="none" stroke="#E9E6FB" strokeWidth="14" />
        <motion.circle
          cx="66" cy="66" r={radius} fill="none" stroke="url(#plan-ring)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={length}
          initial={reduce ? false : { strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - value / 100) }}
          transition={{ duration: 1.4, ease: EASE, delay: 0.25 }}
        />
        <defs>
          <linearGradient id="plan-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8F80F0" />
            <stop offset="1" stopColor="#5140B8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="font-display text-3xl leading-none">{arNum(value)}٪</strong>
        <span className="mt-1 text-xs text-[var(--soft)]">{label}</span>
      </div>
    </div>
  );
}

function FocusCard({ idea, state, member, data, onOpen }: { idea?: Idea; state: EngagementState; member: TeamMember; data: MediaData; onOpen: (id: string) => void }) {
  const { act } = useEngagement();
  const session = state.session;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);
  const sessionIdea = session?.ideaId ? data.ideas.find((item) => item.id === session.ideaId) : undefined;
  const task = session?.taskId ? state.tasks.find((item) => item.id === session.taskId) : undefined;
  const target = session ? sessionIdea : idea;
  const title = session ? sessionIdea?.title || task?.title || session.label || "وقت تركيز" : idea?.title;
  const run = async (payload: Record<string, unknown> & { action: string }) => {
    setBusy(true);
    setError("");
    try {
      await act(payload);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  if (!title) return null;
  const elapsed = session ? (now - Date.parse(session.startedAt)) / 1000 : 0;
  const step = target ? nextStep(target, member) : "";
  return (
    <section
      aria-label="شغّال الآن"
      className={`relative overflow-hidden rounded-[28px] bg-[#1D243C] p-6 text-white shadow-[0_18px_40px_rgb(29_36_60/0.22)] sm:p-8 ${session ? "media-focus-live" : ""}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -end-20 size-72 rounded-full bg-[radial-gradient(circle,#6250D855,transparent_70%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 text-sm text-[#C9CEE0]">
        <span className="inline-flex items-center gap-2.5">
          <span className={`size-2.5 rounded-full ${session ? "bg-[#22B573]" : "bg-[#F2A33A]"}`} />
          {session ? "شغّال الآن" : addressed(member.addressForm, "جاهز تبدأ؟", "جاهزة تبدئين؟")}
          {target && ` · ${WORK_TYPE_LABELS[target.workType]}`}
        </span>
        {target && <span><bdi>{target.code}</bdi> · {ideaCompanyLabel(target, data.companies, true)}</span>}
      </div>
      <h2 className="relative mt-4 font-display !text-3xl !font-medium !leading-tight">{title}</h2>
      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-5">
        <div className="flex flex-wrap gap-2.5">
          {session ? (
            <>
              <button type="button" disabled={busy} onClick={() => void run({ action: "stopSession" })} className="media-button min-h-11 min-w-36 rounded-2xl bg-[#2D3550] px-5 font-medium text-white transition-colors hover:bg-[#38415f]">
                إيقاف مؤقت
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(task ? { action: "toggleTask", id: task.id, done: true } : { action: "stopSession" }).then(() => task && act({ action: "stopSession" }))}
                className="media-button min-h-11 min-w-28 rounded-2xl bg-[#F2A33A] px-5 font-bold text-[#1D243C] transition-colors hover:bg-[#f6b558]"
              >
                تم
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void run({ action: "startSession", ideaId: idea?.id, label: idea?.title })} className="media-button min-h-11 min-w-36 rounded-2xl bg-[#F2A33A] px-5 font-bold text-[#1D243C] transition-colors hover:bg-[#f6b558]">
                {addressed(member.addressForm, "ابدأ التركيز", "ابدئي التركيز")}
              </button>
              {idea && (
                <button type="button" onClick={() => onOpen(idea.id)} className="media-button min-h-11 rounded-2xl bg-[#2D3550] px-5 font-medium text-white transition-colors hover:bg-[#38415f]">
                  فتح العمل
                </button>
              )}
            </>
          )}
        </div>
        <strong dir="ltr" className="font-display text-6xl leading-none tracking-wide text-[#F2B04F] tabular-nums" aria-live="off">
          {clock(elapsed)}
        </strong>
      </div>
      {step && (
        <p className="relative mt-5 flex items-center gap-2.5 border-t border-[#2D3550] pt-4 text-sm text-[#C9CEE0]">
          <Icon3D name="bolt" className="size-6" />
          الخطوة التالية: {step}
        </p>
      )}
      {error && <p role="alert" className="relative mt-3 text-sm text-[#FFB4BF]">{error}</p>}
    </section>
  );
}

function WorkCard({ idea, data, member, plan, today, onOpen }: { idea: Idea; data: MediaData; member: TeamMember; plan?: string | null; today: string; onOpen: (id: string) => void }) {
  const { act } = useEngagement();
  const [message, setMessage] = useState("");
  const due = dueText(idea.dueDate, today);
  const stage = stageIndex(idea);
  const days = useMemo(() => {
    const result: string[] = [];
    for (let cursor = today; result.length < 6; cursor = addDays(cursor, 1)) if (isWorkDay(cursor)) result.push(cursor);
    return result;
  }, [today]);
  const tone = { late: "bg-[#BD384D] text-white", today: "bg-[#BD384D] text-white", soon: "bg-[#FFF1DC] text-[#8A4B0A]", later: "bg-[#E7F0FF] text-[#23468F]", neutral: "bg-[#EDF0F5] text-[#52617B]" }[due.tone];
  const urgent = due.tone === "late" || due.tone === "today";
  return (
    <article className={`media-card space-y-3.5 p-5 sm:p-6 ${urgent ? "bg-[linear-gradient(90deg,#fff_70%,#FDEDEE_100%)]" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <button type="button" onClick={() => onOpen(idea.id)} className="text-start text-lg font-bold hover:text-[var(--primary)]">
            {idea.title}
          </button>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className={`rounded-full px-2.5 py-0.5 ${tone}`}>{due.label}</span>
            <span className="text-[var(--soft)]">{WORK_TYPE_LABELS[idea.workType]} · {ideaCompanyLabel(idea, data.companies, true)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5" role="img" aria-label={`المرحلة ${arNum(stage + 1)} من ${arNum(STAGES.length)}`}>
          {STAGES.map((_, index) => (
            <span key={index} className={`h-1.5 w-6 rounded-full transition-colors duration-500 ${index <= stage ? "bg-[var(--primary)]" : "bg-[#E3E6EF]"}`} />
          ))}
        </div>
      </div>
      {!CLOSED.includes(idea.status) && (
        <>
          <span className="block text-[13px] text-[var(--soft)]">الأيام المناسبة لها</span>
          <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
            {days.map((day) => {
              const on = plan === day;
              const label = new Intl.DateTimeFormat("ar-SA", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void act({ action: "planIdea", ideaId: idea.id, day }).then(() => setMessage(`خُطّط العمل ليوم ${label}.`), (error) => setMessage(errorText(error)))}
                  className={`min-h-14 min-w-16 rounded-2xl px-3 text-center transition-[background-color,color,transform] duration-300 ease-power3-out active:scale-95 ${on ? "bg-[#1D243C] text-white" : day === idea.dueDate ? "bg-[#FDEDEE] text-[#8F1F33] shadow-[0_0_0_1px_#F4C3CB]" : "bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--accent)]"}`}
                >
                  <span className="block text-xs">{label}</span>
                  <span className="block text-xl leading-tight font-bold">{arNum(Number(day.slice(8)))}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <ActionButton className="!bg-[var(--accent)] !text-[#3F2FA0] !shadow-none" onClick={() => void act({ action: "startSession", ideaId: idea.id, label: idea.title }).catch((error) => setMessage(errorText(error)))}>
          {addressed(member.addressForm, "ابدأ التركيز عليها", "ابدئي التركيز عليها")}
        </ActionButton>
        <ActionButton onClick={() => onOpen(idea.id)}>فتح العمل</ActionButton>
        {message && <span role="status" className="text-xs text-[var(--soft)]">{message}</span>}
      </div>
    </article>
  );
}

function TeamRow({ member, line }: { member: TeamMember; line: string }) {
  const online = useOnline(member.id);
  return (
    <li className="flex items-center gap-3">
      <PersonAvatar member={member} />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-[15px]">{member.name}</strong>
        <span className="block truncate text-[13px] text-[var(--soft)]">
          <span className="sr-only">{online ? "متصل الآن. " : "غير متصل. "}</span>
          {online && line.startsWith("آخر ظهور") ? "متصل الآن" : line}
        </span>
      </div>
    </li>
  );
}

export function NextMeetingCard({ meeting, data, onOpenMeeting, compact }: { meeting?: Meeting; data: MediaData; onOpenMeeting: (id?: string) => void; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (!meeting)
    return (
      <div className="rounded-2xl bg-[#EAF7F5] p-4 text-sm text-[#11665E]">
        لا يوجد اجتماع قادم الآن.
        <button type="button" onClick={() => onOpenMeeting()} className="ms-1 font-medium underline underline-offset-4">صفحة الاجتماعات</button>
      </div>
    );
  const start = Date.parse(meeting.startsAt), end = start + meeting.durationMinutes * 60_000;
  const minutes = Math.round((start - now) / 60_000);
  const live = meeting.status === "live" || (meeting.status === "scheduled" && now >= start && now < end);
  const time = (value: number) => new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const when = live ? "الاجتماع جارٍ الآن" : minutes < 60 && minutes >= 0 ? `يبدأ بعد ${arNum(minutes)} دقيقة` : new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", weekday: "long" }).format(new Date(start));
  const agenda = meeting.items.filter((item) => item.kind === "agenda");
  const present = meeting.attendance.filter((entry) => !entry.leftAt).map((entry) => data.members.find((member) => member.id === entry.memberId)).filter(Boolean) as TeamMember[];
  const faces = present.length ? present : data.members.filter((member) => member.active && member.role !== "superadmin").slice(0, 4);
  return (
    <div className={`flex flex-col gap-2.5 rounded-2xl bg-[#EAF7F5] ${compact ? "p-4" : "p-5"}`}>
      <span className="text-[13px] font-medium text-[#11665E]">{when} · {time(start)} – {time(end)}</span>
      <strong className="text-lg">{meeting.title}</strong>
      {agenda.length > 0 && (
        <span className="line-clamp-2 text-[13px] text-[#35405B]">{plural(agenda.length, AGENDA)} · {agenda.slice(0, 3).map((item) => item.text).join("، ")}</span>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="flex">
          {faces.slice(0, 5).map((member, index) => (
            <PersonAvatar key={member.id} member={member} size="sm" ring="#EAF7F5" className={index ? "-ms-2" : ""} />
          ))}
        </div>
        <ActionButton className="!bg-[#16867B] !text-white !shadow-none hover:!bg-[#11665E]" onClick={() => onOpenMeeting(meeting.id)}>
          {live ? "ادخل الغرفة الآن" : "ادخل الغرفة"}
        </ActionButton>
      </div>
    </div>
  );
}

export function Today({
  data,
  currentUser,
  onOpenIdea,
  onOpenMeeting,
  onOpenHonor,
  onViewIdeas,
  onViewTasks,
}: {
  data: MediaData;
  currentUser: TeamMember;
  onOpenIdea: (id: string) => void;
  onOpenMeeting: (id?: string) => void;
  onOpenHonor: () => void;
  onViewIdeas: () => void;
  onViewTasks: () => void;
}) {
  const { state, error } = useEngagement();
  const [filter, setFilter] = useState<Filter>("today");
  const today = riyadhDay();
  const f = currentUser.addressForm;
  const mine = useMemo(
    () =>
      data.ideas
        .filter((idea) => !idea.deletedAt && !CLOSED.includes(idea.status) && (idea.ownerId === currentUser.id || idea.designerId === currentUser.id))
        .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")),
    [data.ideas, currentUser.id],
  );
  const counts = {
    late: mine.filter((idea) => idea.dueDate && idea.dueDate < today).length,
    today: mine.filter((idea) => idea.dueDate === today).length,
    week: mine.filter((idea) => idea.dueDate && daysBetween(today, idea.dueDate) >= 0 && daysBetween(today, idea.dueDate) <= 6).length,
  };
  const listed = mine.filter((idea) => (filter === "late" ? idea.dueDate && idea.dueDate < today : filter === "today" ? idea.dueDate && idea.dueDate <= today : idea.dueDate && daysBetween(today, idea.dueDate) <= 6));
  const shown = (listed.length ? listed : mine).slice(0, 4);
  const top = mine.find((idea) => idea.dueDate && idea.dueDate <= today) || mine[0];
  const tasks = state?.tasks || [];
  const openTasks = tasks.filter((task) => !task.doneAt);
  const todayTasks = tasks.filter((task) => task.dueDate === today || (!task.dueDate && (!task.doneAt || task.doneAt.slice(0, 10) === today)));
  const planned = todayTasks.length + counts.today;
  const done = todayTasks.filter((task) => task.doneAt).length + data.ideas.filter((idea) => idea.deliveredAt === today && (idea.designerId === currentUser.id || idea.ownerId === currentUser.id)).length;
  const progress = planned ? Math.min(100, Math.round((done / planned) * 100)) : 0;
  const deliveredMonth = data.ideas.filter((idea) => idea.status === "delivered" && idea.deliveredAt?.slice(0, 7) === today.slice(0, 7) && (idea.designerId === currentUser.id || idea.ownerId === currentUser.id)).length;
  const upcoming = (state?.meetings || []).filter((meeting) => meeting.status !== "cancelled" && meeting.status !== "ended" && Date.parse(meeting.startsAt) + meeting.durationMinutes * 60_000 > Date.parse(state?.now || "1970-01-01"));
  const nextMeeting = upcoming[0];
  const meetingToday = nextMeeting && riyadhDay(new Date(nextMeeting.startsAt)) === today;
  const focusTotal = (state?.focus || []).reduce((sum, entry) => sum + entry.minutes, 0);
  const plans = new Map(tasks.filter((task) => task.source === "plan" && !task.doneAt && task.ideaId).map((task) => [task.ideaId!, task.dueDate]));
  const team = data.members.filter((member) => member.active && member.id !== currentUser.id && member.role !== "superadmin");
  const teamState = new Map((state?.team || []).map((entry) => [entry.memberId, entry]));
  const onlineCount = useOnlineCount(team.map((member) => member.id));
  const winner = state?.honor.current ? data.members.find((member) => member.id === state.honor.current!.memberId) : undefined;
  const leader = state?.honor.podium[0] ? data.members.find((member) => member.id === state.honor.podium[0].memberId) : undefined;
  const week = state?.week.filter((entry) => isWorkDay(entry.day)) || [];
  const weekMax = Math.max(1, ...week.map((entry) => entry.done));
  const dateLabel = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const summary = [
    counts.today ? `عندك ${plural(counts.today, WORKS)} ${counts.today === 1 ? "موعده" : "موعدها"} اليوم` : mine.length ? `عندك ${plural(mine.length, WORKS)} ${mine.length === 1 ? "جارٍ" : "جارية"}` : addressed(f, "ما عندك أعمال مسندة الآن", "ما عندك أعمال مسندة الآن"),
    meetingToday ? `واجتماع «${nextMeeting.title}» الساعة ${new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }).format(new Date(nextMeeting.startsAt))}` : "",
  ].filter(Boolean).join(" ") + "." + (top ? ` ${addressed(f, "ابدأ", "ابدئي")} بـ «${top.title}»${top.dueDate === today ? " لأن موعدها اليوم" : top.dueDate && top.dueDate < today ? " لأنها متأخرة" : ""}.` : "");

  return (
    <div className="flex flex-wrap items-start gap-6 lg:gap-7">
      <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-6" aria-label="يومي">
        <Reveal index={0}>
          <div className="media-card flex flex-wrap items-center justify-between gap-6 bg-[radial-gradient(120%_140%_at_100%_0%,#EEEBFC_0%,#fff_55%)] p-6 sm:p-8">
            <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5">
              <span className="text-sm text-[var(--soft)]">{dateLabel}{meetingToday ? " · يوم العمل عن بعد" : ""}</span>
              <h1 className="font-display !text-[clamp(1.9rem,4vw,2.5rem)] !font-medium !leading-tight">
                {greeting()} يا {firstName(currentUser.name)}
              </h1>
              <p className="max-w-[35em] text-[17px] text-[#35405B]">{summary}</p>
              <div className="mt-1.5 flex flex-wrap gap-2.5">
                {(state?.streak || 0) > 0 && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#FFF4E3] py-1.5 ps-2.5 pe-3.5 font-medium text-[#8A4B0A]">
                    <Icon3D name="flame" className="size-6" />
                    {streakText(state!.streak)}
                  </span>
                )}
                <span className="inline-flex items-center gap-2 rounded-full bg-[#E7F6EF] py-1.5 ps-2.5 pe-3.5 font-medium text-[#155F43]">
                  <Icon3D name="check" className="size-6" />
                  {deliveredMonth ? `${addressed(f, "سلّمت", "سلّمتِ")} ${plural(deliveredMonth, WORKS)} هذا الشهر` : "أول تسليم هذا الشهر بانتظارك"}
                </span>
              </div>
            </div>
            <PlanRing value={progress} label="من خطة اليوم" />
          </div>
        </Reveal>

        <Reveal index={1}>
          <div className="media-card flex flex-col gap-3.5 p-5 sm:px-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-[17px] font-bold">
                <Icon3D name="timer" className="size-7" />
                وقت التركيز هذا الأسبوع
              </span>
              <strong className="font-display text-[28px] font-medium">{minutesText(focusTotal)}</strong>
            </div>
            {focusTotal > 0 ? (
              <>
                <div className="flex h-3 gap-1" role="img" aria-label={`توزيع الوقت: ${state!.focus.map((entry) => `${entry.label} ${minutesText(entry.minutes)}`).join("، ")}`}>
                  {state!.focus.map((entry, index) => (
                    <motion.span key={entry.label} className="rounded-md" style={{ background: FOCUS_COLORS[index % FOCUS_COLORS.length], flexGrow: entry.minutes, flexBasis: 0 }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 + index * 0.08 }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-5 text-sm text-[var(--soft)]">
                  {state!.focus.map((entry, index) => (
                    <span key={entry.label} className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: FOCUS_COLORS[index % FOCUS_COLORS.length] }} />
                      {entry.label} <b className="text-[var(--foreground)]">{minutesText(entry.minutes)}</b>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--soft)]">{addressed(f, "ابدأ التركيز على أي عمل، ويُحسب وقتك تلقائياً حسب نوعه.", "ابدئي التركيز على أي عمل، ويُحسب وقتك تلقائياً حسب نوعه.")}</p>
            )}
          </div>
        </Reveal>

        <Reveal index={2} className="flex flex-wrap gap-2.5">
          {([["late", "متأخرة", "#BD384D", "#FDEDEE"], ["today", "اليوم", "#5140B8", "#EEEBFC"], ["week", "هذا الأسبوع", "#11665E", "#EAF7F5"]] as const).map(([id, label, color, wash]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4.5 font-medium transition-[background-color,color,border-color] duration-300 ease-power3-out"
              style={filter === id ? { background: wash, color, borderColor: color } : { background: "#fff", color: "#20273C", borderColor: "#E1E4EE" }}
            >
              <b>{arNum(counts[id])}</b> {label}
            </button>
          ))}
        </Reveal>

        <Reveal index={3}>
          <SmartAdd currentUser={currentUser} />
          {openTasks.length + tasks.filter((task) => task.doneAt && task.doneAt.slice(0, 10) === today).length > 0 && (
            <ul className="mt-3 space-y-2">
              <AnimatePresence initial={false}>
                {[...openTasks, ...tasks.filter((task) => task.doneAt && task.doneAt.slice(0, 10) === today)].slice(0, 8).map((task) => (
                  <TaskRow key={task.id} task={task} data={data} currentUser={currentUser} onOpenIdea={onOpenIdea} compact />
                ))}
              </AnimatePresence>
            </ul>
          )}
          {openTasks.length > 8 && (
            <button type="button" onClick={onViewTasks} className="mt-2 text-sm text-[#5140B8] underline-offset-4 hover:underline">كل مهامي ({arNum(openTasks.length)})</button>
          )}
        </Reveal>

        {state && (top || state.session) && (
          <Reveal index={4}>
            <FocusCard idea={top} state={state} member={currentUser} data={data} onOpen={onOpenIdea} />
          </Reveal>
        )}

        <Reveal index={5} className="flex flex-col gap-3.5">
          <div className="flex items-baseline justify-between">
            <h2 className="!text-[22px]">أعمالك القريبة</h2>
            <button type="button" onClick={onViewIdeas} className="text-sm text-[#5140B8] underline-offset-4 hover:underline">كل أعمالي</button>
          </div>
          {shown.length ? (
            shown.map((idea) => <WorkCard key={idea.id} idea={idea} data={data} member={currentUser} plan={plans.get(idea.id)} today={today} onOpen={onOpenIdea} />)
          ) : (
            <div className="media-card flex items-center gap-3 p-5 text-[var(--soft)]">
              <Icon3D name="sun" className="size-9" />
              {addressed(f, "ما عندك أعمال مسندة الآن. وقت مناسب لفكرة جديدة!", "ما عندك أعمال مسندة الآن. وقت مناسب لفكرة جديدة!")}
            </div>
          )}
        </Reveal>
      </section>

      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5" aria-label="الفريق والاجتماعات">
        <Reveal index={2}>
          <section className="media-card flex flex-col gap-3.5 p-5">
            <div className="flex items-center gap-2.5">
              <Icon3D name="video" className="size-9" />
              <div>
                <strong className="block">{meetingToday ? "يوم العمل عن بعد" : "الاجتماع القادم"}</strong>
                <span className="text-[13px] text-[var(--soft)]">وصل غرفتكم المشتركة</span>
              </div>
            </div>
            <NextMeetingCard meeting={nextMeeting} data={data} onOpenMeeting={onOpenMeeting} />
          </section>
        </Reveal>

        <Reveal index={3}>
          <section className="media-card flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between">
              <strong className="flex items-center gap-2"><Icon3D name="team" className="size-7" />الفريق الآن</strong>
              <span className="text-[13px] text-[#155F43]">{arNum(onlineCount)} متصلون</span>
            </div>
            <ul className="space-y-3">
              {team
                .slice()
                .sort((a, b) => (Date.parse(teamState.get(b.id)?.lastSeenAt || "0") || 0) - (Date.parse(teamState.get(a.id)?.lastSeenAt || "0") || 0))
                .slice(0, 8)
                .map((member) => {
                  const entry = teamState.get(member.id);
                  const working = entry?.working;
                  const workingIdea = working?.ideaId ? data.ideas.find((idea) => idea.id === working.ideaId) : undefined;
                  const line = working ? `يعمل على «${workingIdea?.title || working.label || "مهمة"}»` : entry?.lastSeenAt ? `آخر ظهور ${relativeTime(entry.lastSeenAt)}` : relativeTime(null);
                  return <TeamRow key={member.id} member={member} line={line} />;
                })}
            </ul>
          </section>
        </Reveal>

        {(winner || leader) && (
          <Reveal index={4}>
            <button type="button" onClick={onOpenHonor} className="media-card flex w-full items-center gap-3.5 bg-[linear-gradient(135deg,#FFF8E8_0%,#fff_60%)] p-5 text-start transition-transform duration-300 ease-power3-out hover:-translate-y-0.5">
              <Icon3D name="trophy" className="size-14" />
              <div className="min-w-0 flex-1">
                <span className="text-[13px] text-[#8A4B0A]">{winner ? "الموظف المثالي للشهر الماضي" : "يتصدّر سباق هذا الشهر"}</span>
                <strong className="block text-[19px]">{(winner || leader)!.name}</strong>
                {winner && state?.honor.current?.summary && <span className="line-clamp-2 text-[13px] text-[var(--soft)]">{state.honor.current.summary}</span>}
              </div>
            </button>
          </Reveal>
        )}

        <Reveal index={5}>
          <section className="media-card flex flex-col gap-3 p-5">
            <strong className="flex items-center gap-2"><Icon3D name="chart" className="size-7" />إنجازك هذا الأسبوع</strong>
            <div className="flex h-24 items-end gap-2.5" role="img" aria-label={`الإنجاز اليومي: ${week.map((entry) => arNum(entry.done)).join("، ")}`}>
              {week.map((entry, index) => (
                <motion.span
                  key={entry.day}
                  className={`flex-1 origin-bottom rounded-lg ${entry.day === today ? "bg-[var(--primary)]" : "bg-[#D9D3FA]"}`}
                  style={{ height: `${Math.max(8, (entry.done / weekMax) * 100)}%` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.3 + index * 0.07 }}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-[var(--soft)]">
              {week.map((entry) => (
                <span key={entry.day}>{new Intl.DateTimeFormat("ar-SA", { weekday: "short", timeZone: "UTC" }).format(new Date(`${entry.day}T12:00:00Z`))}</span>
              ))}
            </div>
          </section>
        </Reveal>
        {error && !state && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      </aside>
    </div>
  );
}

function useOnlineCount(ids: string[]) {
  return useTeamPresence((state) => ids.filter((id) => isOnline(state, id)).length);
}

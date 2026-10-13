"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MediaData, TeamMember } from "@/data/media";
import type { Meeting, MeetingItem } from "@/data/engagement";
import { isAdministrator } from "@/lib/media-workflow";
import { useEngagement } from "@/stores/engagement-store";
import { ContextDiscussion } from "../social";
import { ActionButton, Icon, Modal, errorText } from "../ui";
import { Icon3D } from "./icons-3d";
import { PersonAvatar, useOnline } from "./person";
import { AGENDA, DECISIONS, TASKS, addDays, arNum, clock, plural, relativeTime, riyadhDay } from "./format";

const EASE = [0.25, 1, 0.5, 1] as const;
const time = (iso: string) => new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dateLabel = (iso: string) => new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const canManage = (member: TeamMember) => isAdministrator(member) || member.role === "manager";

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

function liveState(meeting: Meeting, now: number) {
  const start = Date.parse(meeting.startsAt), end = start + meeting.durationMinutes * 60_000;
  if (meeting.status === "cancelled") return "cancelled" as const;
  if (meeting.status === "ended") return "ended" as const;
  if (meeting.status === "live" || (now >= start && now < end)) return "live" as const;
  return now < start ? ("upcoming" as const) : ("ended" as const);
}

function NewMeetingDialog({ open, onClose, data, onCreated }: { open: boolean; onClose: () => void; data: MediaData; onCreated: (id: string) => void }) {
  const { act } = useEngagement();
  const next = useMemo(() => {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    let day = hour >= 10 ? addDays(riyadhDay(), 1) : riyadhDay();
    for (let index = 0; index < 7 && [5, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()); index++) day = addDays(day, 1);
    return day;
  }, []);
  const [title, setTitle] = useState("اجتماع الفريق الأسبوعي"),
    [day, setDay] = useState(next),
    [hour, setHour] = useState("11:00"),
    [duration, setDuration] = useState("45"),
    [teams, setTeams] = useState(""),
    [agenda, setAgenda] = useState<{ text: string; ideaId: string }[]>([{ text: "", ideaId: "" }]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ideas = data.ideas.filter((idea) => !idea.deletedAt && !["cancelled", "rejected"].includes(idea.status));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      await act({
        action: "createMeeting", id, title, startsAt: new Date(`${day}T${hour}:00+03:00`).toISOString(), durationMinutes: Number(duration), teamsUrl: teams.trim() || null,
        agenda: agenda.filter((item) => item.text.trim() || item.ideaId).map((item) => ({ text: item.text.trim() || ideas.find((idea) => idea.id === item.ideaId)?.title || "", ideaId: item.ideaId || null })),
      });
      onCreated(id);
      onClose();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} locked={busy} title="اجتماع جديد" description="يُرسل إشعار لكل الفريق، وتصلهم تذكرة قبل البدء." wide>
      <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
        <label className="media-label">
          عنوان الاجتماع
          <input className="media-input mt-2" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="media-label">
            اليوم
            <input type="date" className="media-input mt-2" required value={day} onChange={(event) => setDay(event.target.value)} />
          </label>
          <label className="media-label">
            الساعة
            <input type="time" className="media-input mt-2" required value={hour} onChange={(event) => setHour(event.target.value)} />
          </label>
          <label className="media-label">
            المدة بالدقائق
            <input type="number" min={5} max={600} className="media-input mt-2" required value={duration} onChange={(event) => setDuration(event.target.value)} />
          </label>
        </div>
        <label className="media-label">
          رابط Microsoft Teams
          <input type="url" dir="ltr" inputMode="url" className="media-input mt-2 text-left" placeholder="https://teams.microsoft.com/…" value={teams} onChange={(event) => setTeams(event.target.value)} />
        </label>
        <fieldset className="space-y-2.5">
          <legend className="media-label">جدول الأعمال</legend>
          {agenda.map((item, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_16em_auto]">
              <input className="media-input" aria-label={`البند ${arNum(index + 1)}`} placeholder={`البند ${arNum(index + 1)}`} maxLength={1000} value={item.text} onChange={(event) => setAgenda(agenda.map((entry, position) => (position === index ? { ...entry, text: event.target.value } : entry)))} />
              <select className="media-input" aria-label={`ربط البند ${arNum(index + 1)} بفكرة`} value={item.ideaId} onChange={(event) => setAgenda(agenda.map((entry, position) => (position === index ? { ...entry, ideaId: event.target.value } : entry)))}>
                <option value="">بدون ربط بفكرة</option>
                {ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.code} · {idea.title}</option>)}
              </select>
              <ActionButton aria-label="حذف البند" className="size-11 px-0" onClick={() => setAgenda(agenda.length > 1 ? agenda.filter((_, position) => position !== index) : [{ text: "", ideaId: "" }])}>
                <Icon name="close" className="size-4" />
              </ActionButton>
            </div>
          ))}
          <ActionButton onClick={() => setAgenda([...agenda, { text: "", ideaId: "" }])}>
            <Icon name="plus" className="size-4" />
            إضافة بند
          </ActionButton>
        </fieldset>
        {error && <p role="alert" className="text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <ActionButton onClick={onClose} disabled={busy}>إلغاء</ActionButton>
          <ActionButton type="submit" primary disabled={busy}>{busy ? "جارٍ الإنشاء…" : "إنشاء الاجتماع"}</ActionButton>
        </div>
      </form>
    </Modal>
  );
}

function AttendeeRow({ member, meeting, manager, now }: { member: TeamMember; meeting: Meeting; manager: boolean; now: number }) {
  const online = useOnline(member.id);
  const entry = meeting.attendance.find((item) => item.memberId === member.id);
  const inRoom = entry && !entry.leftAt;
  const line = member.id === meeting.createdBy ? "يدير الاجتماع" : inRoom ? `في الغرفة منذ ${arNum(Math.max(1, Math.round((now - Date.parse(entry.joinedAt)) / 60_000)))} دقيقة` : entry ? "غادر الغرفة" : online ? "متصل، لم ينضم بعد" : "لم ينضم بعد";
  return (
    <li className="flex items-center gap-3">
      <PersonAvatar member={member} ring={inRoom ? "#BFE8DA" : undefined} />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-[15px]">{member.name}</strong>
        <span className={`text-[13px] ${inRoom ? "text-[#11665E]" : "text-[var(--soft)]"}`}>{line}</span>
      </div>
      {manager && !inRoom && <span className="sr-only">{line}</span>}
    </li>
  );
}

function ItemList({ meeting, kind, data, editable, currentUserId }: { meeting: Meeting; kind: MeetingItem["kind"]; data: MediaData; editable: boolean; currentUserId: string }) {
  const { act } = useEngagement();
  const items = meeting.items.filter((item) => item.kind === kind);
  const [text, setText] = useState(""), [assignee, setAssignee] = useState(""), [due, setDue] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await act({ action: "addMeetingItem", meetingId: meeting.id, kind, text: text.trim(), assigneeId: assignee || null, dueDate: due || null }, { reload: kind === "action" });
      setText("");
      setDue("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const members = data.members.filter((member) => member.active && member.role !== "superadmin");
  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const owner = data.members.find((member) => member.id === item.assigneeId);
          return (
            <motion.div key={item.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.4, ease: EASE }} className={`flex items-center gap-3 rounded-2xl p-3 ${kind === "decision" ? "bg-[#E7F6EF]" : "bg-[#F8F9FC]"}`}>
              {kind === "decision" ? <Icon3D name="flag" className="size-7" /> : owner ? <PersonAvatar member={owner} size="sm" /> : <Icon3D name="check" className="size-7" />}
              <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-[var(--soft)] line-through" : ""}`}>{item.text}</span>
              {kind === "action" && owner && <span className="text-xs text-[#11665E]">أُضيفت إلى «يومي» لدى {owner.name.split(" ")[0]}</span>}
              {kind === "action" && (editable || item.assigneeId === currentUserId || item.createdBy === currentUserId) && (
                <input type="checkbox" aria-label={`إنجاز ${item.text}`} checked={item.done} onChange={(event) => void act({ action: "updateMeetingItem", id: item.id, done: event.target.checked })} className="size-5 accent-[#1E8A5F]" />
              )}
              {editable && (
                <button type="button" aria-label={`حذف ${item.text}`} className="rounded-lg p-1.5 text-[var(--soft)] hover:bg-white" onClick={() => void act({ action: "updateMeetingItem", id: item.id, remove: true })}>
                  <Icon name="close" className="size-3.5" />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {editable && meeting.status !== "cancelled" && (
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`${meeting.id}-${kind}`}>{kind === "decision" ? "قرار جديد" : "مهمة جديدة"}</label>
          <input id={`${meeting.id}-${kind}`} className="media-input min-w-[12em] flex-1" maxLength={1000} placeholder={kind === "decision" ? "قرار جديد…" : "مهمة جديدة خرجت من الاجتماع…"} value={text} onChange={(event) => setText(event.target.value)} />
          {kind === "action" && (
            <>
              <select className="media-input w-auto" aria-label="المسؤول" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                <option value="">المسؤول</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
              <input type="date" aria-label="موعد المهمة" className="media-input w-auto" value={due} onChange={(event) => setDue(event.target.value)} />
            </>
          )}
          <ActionButton type="submit" disabled={busy} className="!bg-[#1D243C] !text-white !shadow-none">
            {kind === "decision" ? "إضافة القرار" : "إضافة المهمة"}
          </ActionButton>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}

function MeetingRoom({ meeting, data, currentUser, onOpenIdea, onBack }: { meeting: Meeting; data: MediaData; currentUser: TeamMember; onOpenIdea: (id: string) => void; onBack: () => void }) {
  const { act } = useEngagement();
  const now = useNow();
  const reduce = useReducedMotion();
  const status = liveState(meeting, now);
  const manager = canManage(currentUser) || meeting.createdBy === currentUser.id;
  const [notes, setNotes] = useState(meeting.notes);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [current, setCurrent] = useState(() => meeting.items.find((item) => item.kind === "agenda" && !item.done)?.id);
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const baseRef = useRef(meeting.notes);
  const joined = meeting.attendance.some((entry) => entry.memberId === currentUser.id && !entry.leftAt);
  const [syncedNotes, setSyncedNotes] = useState(meeting.notes);
  if (!editing && saved !== "saving" && meeting.notes !== syncedNotes) {
    setSyncedNotes(meeting.notes);
    setNotes(meeting.notes);
  }
  useEffect(() => {
    if (status === "live" && !joined) void act({ action: "joinMeeting", meetingId: meeting.id }, { reload: false }).catch(() => undefined);
  }, [status, joined, act, meeting.id]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);
  useEffect(() => {
    if (!editing && saved !== "saving") baseRef.current = meeting.notes;
  }, [meeting.notes, editing, saved]);
  const changeNotes = (value: string) => {
    setNotes(value);
    setSaved("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const base = baseRef.current;
      void act<{ meeting?: Meeting }>({ action: "updateMeeting", id: meeting.id, notes: value, baseNotes: base }, { reload: false })
        .then((result) => {
          baseRef.current = result.meeting?.notes ?? value;
          if (result.meeting && result.meeting.notes !== value) setNotes(result.meeting.notes);
          setSaved("saved");
        })
        .catch((cause) => setError(errorText(cause)));
    }, 900);
  };
  const run = (payload: Record<string, unknown> & { action: string }) => void act(payload).catch((cause) => setError(errorText(cause)));
  const agenda = meeting.items.filter((item) => item.kind === "agenda");
  const currentItem = agenda.find((item) => item.id === current) || agenda[0];
  const members = data.members.filter((member) => member.active && member.role !== "superadmin");
  const inRoom = meeting.attendance.filter((entry) => !entry.leftAt).length;
  const elapsed = (now - Date.parse(meeting.startsAt)) / 1000;
  return (
    <motion.div initial={reduce ? false : { opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="space-y-6">
      <header className="media-card flex flex-wrap items-center justify-between gap-4 bg-[radial-gradient(120%_160%_at_100%_0%,#EAF7F5_0%,#fff_60%)] p-5 sm:p-7">
        <div className="flex items-center gap-3.5">
          <button type="button" onClick={onBack} aria-label="العودة إلى الاجتماعات" className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_var(--border)] hover:bg-[var(--background)]">
            <Icon name="arrow" className="size-4 rotate-180" />
          </button>
          <Icon3D name="video" className="size-12" />
          <div>
            <span className="text-[13px] text-[var(--soft)]">{dateLabel(meeting.startsAt)} · {time(meeting.startsAt)}</span>
            <h1 className="font-display !text-[clamp(1.5rem,3vw,2rem)] !font-medium">{meeting.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ${status === "live" ? "bg-[#E7F6EF] text-[#155F43]" : status === "cancelled" ? "bg-[#FDEDEE] text-[#8F1F33]" : "bg-[var(--background)] text-[var(--soft)]"}`}>
            <span className={`size-2.5 rounded-full ${status === "live" ? "media-presence-dot relative bg-[#22B573]" : "bg-[#B7BDCC]"}`} />
            {status === "live" ? <>يجري الآن · <b dir="ltr" className="tabular-nums">{clock(Math.max(0, elapsed))}</b></> : status === "upcoming" ? `يبدأ ${relativeStart(meeting.startsAt, now)}` : status === "cancelled" ? "أُلغي" : "انتهى"}
          </span>
          {meeting.teamsUrl && (
            <a href={meeting.teamsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-[#464EB8] px-4 font-medium text-white hover:bg-[#3a419c]">
              فتح رابط Teams
            </a>
          )}
          {status !== "cancelled" && status !== "ended" && (joined ? (
            <ActionButton onClick={() => run({ action: "leaveMeeting", meetingId: meeting.id })}>مغادرة الغرفة</ActionButton>
          ) : (
            <ActionButton className="!bg-[#16867B] !text-white !shadow-none" onClick={() => run({ action: "joinMeeting", meetingId: meeting.id })}>انضم للغرفة</ActionButton>
          ))}
          {manager && status === "upcoming" && <ActionButton onClick={() => run({ action: "updateMeeting", id: meeting.id, status: "live" })}>بدء الاجتماع الآن</ActionButton>}
          {manager && status === "live" && <ActionButton primary onClick={() => run({ action: "updateMeeting", id: meeting.id, status: "ended" })}>إنهاء الاجتماع وحفظ المحضر</ActionButton>}
          {manager && status === "upcoming" && <ActionButton className="!text-[var(--danger)]" onClick={() => run({ action: "updateMeeting", id: meeting.id, status: "cancelled" })}>إلغاء الاجتماع</ActionButton>}
        </div>
      </header>
      {error && <p role="alert" className="rounded-xl bg-[#fff0f1] p-3 text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[999_1_600px] flex-col gap-6">
          <div className="media-card space-y-3 p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="!text-xl">جدول الأعمال</h2>
              <span className="text-sm text-[var(--soft)]">أُنجز {arNum(agenda.filter((item) => item.done).length)} من {arNum(agenda.length)}</span>
            </div>
            {agenda.length === 0 && <p className="text-sm text-[var(--soft)]">لا توجد بنود بعد.</p>}
            {agenda.map((item) => {
              const idea = item.ideaId ? data.ideas.find((entry) => entry.id === item.ideaId) : undefined;
              const active = currentItem?.id === item.id;
              return (
                <motion.div layout key={item.id} className={`flex items-center gap-3.5 rounded-2xl p-3 transition-colors duration-300 ${active ? "bg-[#EAF7F5] shadow-[inset_0_0_0_2px_#16867B]" : "bg-[#F8F9FC]"}`}>
                  <button
                    type="button"
                    aria-label={item.done ? `إلغاء إنهاء البند: ${item.text}` : `إنهاء البند: ${item.text}`}
                    aria-pressed={item.done}
                    disabled={!manager}
                    onClick={() => run({ action: "updateMeetingItem", id: item.id, done: !item.done })}
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${item.done ? "bg-[#1E8A5F] text-white" : "bg-white shadow-[inset_0_0_0_2px_#C7CCD9]"}`}
                  >
                    {item.done && <Icon name="check" className="size-4" />}
                  </button>
                  <button type="button" onClick={() => setCurrent(item.id)} className="min-w-0 flex-1 text-start">
                    <strong className={`block ${item.done ? "text-[var(--soft)] line-through" : ""}`}>{item.text}</strong>
                    {idea && <span className="text-[13px] text-[var(--soft)]">مرتبط بالفكرة <bdi>{idea.code}</bdi></span>}
                  </button>
                  {idea && <ActionButton onClick={() => onOpenIdea(idea.id)} className="!text-xs">فتح الفكرة</ActionButton>}
                </motion.div>
              );
            })}
            {manager && <ItemListAgenda meeting={meeting} />}
          </div>
          <div className="media-card space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="!text-xl">ملاحظات الاجتماع{currentItem ? `: ${currentItem.text}` : ""}</h2>
              <span className="text-xs text-[var(--soft)]" role="status">{saved === "saving" ? "جارٍ الحفظ…" : saved === "saved" ? "حُفظت الملاحظات" : "يكتب فيها كل الحضور"}</span>
            </div>
            <label htmlFor={`notes-${meeting.id}`} className="sr-only">ملاحظات الاجتماع</label>
            <textarea
              id={`notes-${meeting.id}`}
              className="media-input min-h-44 resize-y leading-relaxed"
              value={notes}
              maxLength={20000}
              disabled={status === "cancelled" || (status === "ended" && !manager)}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              onChange={(event) => changeNotes(event.target.value)}
              placeholder="اكتب النقاط المهمة كما تُقال…"
            />
            <div className="space-y-2.5">
              <strong className="flex items-center gap-2"><Icon3D name="flag" className="size-6" />القرارات</strong>
              <ItemList meeting={meeting} kind="decision" data={data} editable={manager} currentUserId={currentUser.id} />
            </div>
            <div className="space-y-2.5">
              <strong className="flex items-center gap-2"><Icon3D name="check" className="size-6" />مهام خرجت من الاجتماع</strong>
              <ItemList meeting={meeting} kind="action" data={data} editable={manager} currentUserId={currentUser.id} />
            </div>
          </div>
        </section>
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <section className="media-card space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <strong>الحضور</strong>
              <span className="text-[13px] text-[#155F43]">{arNum(inRoom)} من {arNum(members.length)} في الغرفة</span>
            </div>
            <ul className="space-y-3">
              {members
                .slice()
                .sort((a, b) => Number(meeting.attendance.some((entry) => entry.memberId === b.id && !entry.leftAt)) - Number(meeting.attendance.some((entry) => entry.memberId === a.id && !entry.leftAt)))
                .map((member) => <AttendeeRow key={member.id} member={member} meeting={meeting} manager={manager} now={now} />)}
            </ul>
          </section>
          <section className="media-card p-4">
            <ContextDiscussion contextType="meeting" contextId={meeting.id} title="محادثة الاجتماع" data={data} currentUser={currentUser} />
          </section>
        </aside>
      </div>
    </motion.div>
  );
}

function relativeStart(iso: string, now: number) {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (minutes < 60) return `بعد ${arNum(Math.max(1, minutes))} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `بعد ${arNum(hours)} ساعة`;
  return dateLabel(iso);
}

function ItemListAgenda({ meeting }: { meeting: Meeting }) {
  const { act } = useEngagement();
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        void act({ action: "addMeetingItem", meetingId: meeting.id, kind: "agenda", text: text.trim() }, { reload: false }).then(() => setText(""));
      }}
    >
      <label htmlFor={`agenda-${meeting.id}`} className="sr-only">بند جديد</label>
      <input id={`agenda-${meeting.id}`} className="media-input flex-1" maxLength={1000} placeholder="بند جديد في الأجندة…" value={text} onChange={(event) => setText(event.target.value)} />
      <ActionButton type="submit">إضافة بند</ActionButton>
    </form>
  );
}

export function Meetings({ data, currentUser, selectedId, onSelect, onOpenIdea }: { data: MediaData; currentUser: TeamMember; selectedId?: string; onSelect: (id?: string) => void; onOpenIdea: (id: string) => void }) {
  const { state } = useEngagement();
  const now = useNow(30_000);
  const [creating, setCreating] = useState(false);
  const meetings = state?.meetings || [];
  const selected = meetings.find((meeting) => meeting.id === selectedId);
  if (selected) return <MeetingRoom key={selected.id} meeting={selected} data={data} currentUser={currentUser} onOpenIdea={onOpenIdea} onBack={() => onSelect(undefined)} />;
  const upcoming = meetings.filter((meeting) => ["upcoming", "live"].includes(liveState(meeting, now)));
  const past = meetings.filter((meeting) => !["upcoming", "live"].includes(liveState(meeting, now))).reverse();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[40em] text-sm text-[var(--soft)]">المهام التي تخرج من الاجتماع تنضاف مباشرة إلى «يومي» لدى المسؤول عنها، والصوت والصورة عبر Teams.</p>
        {canManage(currentUser) && (
          <ActionButton primary onClick={() => setCreating(true)}>
            <Icon name="plus" className="size-4" />
            اجتماع جديد
          </ActionButton>
        )}
      </div>
      {!state && <p className="text-[var(--soft)]" role="status">جارٍ تحميل الاجتماعات…</p>}
      {state && upcoming.length === 0 && (
        <div className="media-card flex items-center gap-4 p-6">
          <Icon3D name="calendar" className="size-12" />
          <div>
            <strong className="block">لا توجد اجتماعات قادمة</strong>
            <span className="text-sm text-[var(--soft)]">{canManage(currentUser) ? "أنشئ اجتماع يوم العمل عن بعد وسيصل الإشعار للفريق." : "سيصلك إشعار عند جدولة اجتماع جديد."}</span>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {upcoming.map((meeting, index) => {
          const status = liveState(meeting, now);
          return (
            <motion.button
              key={meeting.id}
              type="button"
              onClick={() => onSelect(meeting.id)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: index * 0.06 }}
              whileHover={{ y: -3 }}
              className={`media-card flex flex-col gap-2.5 p-5 text-start ${status === "live" ? "bg-[#EAF7F5] shadow-[0_0_0_2px_#16867B]" : ""}`}
            >
              <span className={`text-[13px] font-medium ${status === "live" ? "text-[#11665E]" : "text-[var(--soft)]"}`}>
                {status === "live" ? "يجري الآن" : `${dateLabel(meeting.startsAt)} · ${time(meeting.startsAt)}`}
              </span>
              <strong className="text-lg">{meeting.title}</strong>
              <span className="text-[13px] text-[var(--soft)]">
                {plural(meeting.items.filter((item) => item.kind === "agenda").length, AGENDA)} · {arNum(meeting.durationMinutes)} دقيقة{meeting.teamsUrl ? " · Teams" : ""}
              </span>
            </motion.button>
          );
        })}
      </div>
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="!text-lg">اجتماعات سابقة</h2>
          <ul className="media-card divide-y divide-[var(--border)]">
            {past.map((meeting) => (
              <li key={meeting.id}>
                <button type="button" onClick={() => onSelect(meeting.id)} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-start hover:bg-[var(--background)]">
                  <span>
                    <strong className="block">{meeting.title}</strong>
                    <span className="text-[13px] text-[var(--soft)]">{dateLabel(meeting.startsAt)} · {plural(meeting.items.filter((item) => item.kind === "decision").length, DECISIONS)} · {plural(meeting.items.filter((item) => item.kind === "action").length, TASKS)}</span>
                  </span>
                  <span className="text-xs text-[var(--soft)]">{meeting.status === "cancelled" ? "أُلغي" : relativeTime(meeting.startsAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {creating && <NewMeetingDialog open={creating} onClose={() => setCreating(false)} data={data} onCreated={onSelect} />}
    </div>
  );
}

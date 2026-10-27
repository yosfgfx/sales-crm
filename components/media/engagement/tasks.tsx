"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MediaData, TeamMember } from "@/data/media";
import { TASK_KIND_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, addressed, type PersonalTask, type TaskPriority, type TaskStatus, type TaskUpdate } from "@/data/engagement";
import { useEngagement } from "@/stores/engagement-store";
import { ActionButton, Icon, errorText } from "../ui";
import { Icon3D } from "./icons-3d";
import { PersonAvatar } from "./person";
import { addDays, arNum, dueText, relativeTime, riyadhDay } from "./format";

const EASE = [0.25, 1, 0.5, 1] as const;
const PRIORITY_DOT: Record<TaskPriority, string> = { urgent: "#BD384D", high: "#E08A1E", normal: "#6250D8", low: "#9AA3B5" };
const STATUS_STYLE: Record<TaskStatus, string> = { todo: "bg-[var(--background)] text-[var(--soft)]", doing: "bg-[#FFF4E3] text-[#8A4B0A]", done: "bg-[#E7F6EF] text-[#155F43]" };
const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "done", done: "todo" };
const NEXT_PRIORITY: Record<TaskPriority, TaskPriority> = { normal: "high", high: "urgent", urgent: "low", low: "normal" };
type Filter = "mine" | "created" | "late" | "today" | "done" | "team";

export const canManageTasks = (member: TeamMember | null) => !!member && (member.role === "manager" || member.role === "admin" || member.role === "superadmin");

function useAct() {
  const act = useEngagement((store) => store.act);
  const [error, setError] = useState("");
  const run = async (payload: Record<string, unknown> & { action: string }, reload = false) => {
    setError("");
    try {
      return await act(payload, { reload });
    } catch (cause) {
      setError(errorText(cause));
      return null;
    }
  };
  return { run, error, setError };
}

/** One line, one Enter: the task is saved immediately; the AI then classifies and links it in the background. */
export function SmartAdd({ currentUser, ideaId, placeholder, autoFocus, compact }: { currentUser: TeamMember; ideaId?: string; placeholder?: string; autoFocus?: boolean; compact?: boolean }) {
  const aiAvailable = useEngagement((store) => store.state?.ai.available ?? false);
  const { run, error } = useAct();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const title = text.trim();
    if (!title) return;
    setText("");
    const id = crypto.randomUUID();
    const created = await run({ action: "addTask", id, title, ideaId });
    if (!created) {
      setText(title);
      return;
    }
    if (aiAvailable) {
      setPending(id);
      await run({ action: "enrichTask", id, text: title });
      setPending(null);
    }
  };
  const f = currentUser.addressForm;
  return (
    <form onSubmit={submit} className={`media-card flex items-center gap-2.5 ${compact ? "py-1.5 ps-2.5 pe-2" : "py-2.5 ps-3 pe-2.5"}`}>
      <Icon3D name={pending ? "bolt" : "sparkle"} className={`${compact ? "size-6" : "size-8"} ${pending ? "animate-pulse" : ""}`} />
      <label htmlFor={`smart-add-${ideaId || "board"}`} className="sr-only">إضافة مهمة</label>
      <input
        id={`smart-add-${ideaId || "board"}`}
        value={text}
        maxLength={600}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder || (aiAvailable ? addressed(f, "اكتب المهمة كما تقولها… مثال: سارة تجهز نص الحملة بكرة", "اكتبي المهمة كما تقولينها… مثال: فيصل يصمم بوستر التوعية الخميس") : "اكتب المهمة… @اسم للإسناد، بكرة/الخميس للموعد")}
        className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#7A8299] ${compact ? "min-h-10 text-[15px]" : "min-h-13 text-[17px]"}`}
      />
      <button type="submit" aria-label="إضافة المهمة" disabled={!text.trim()} className={`flex shrink-0 items-center justify-center rounded-full bg-[#1D243C] text-white transition-transform duration-200 ease-power3-out hover:scale-105 active:scale-95 disabled:opacity-40 ${compact ? "size-9" : "size-13"}`}>
        <Icon name="plus" className={compact ? "size-4" : "size-5"} />
      </button>
      {error && <span role="alert" className="text-xs text-[var(--danger)]">{error}</span>}
    </form>
  );
}

function InlineTitle({ task, canEdit, onSave }: { task: PersonalTask; canEdit: boolean; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(task.title);
  if (!canEdit || !editing)
    return (
      <button type="button" onClick={() => canEdit && setEditing(true)} className={`min-w-0 flex-1 truncate text-start ${task.status === "done" ? "text-[var(--soft)] line-through" : "font-medium"}`} title={canEdit ? "اضغط لتعديل العنوان" : undefined}>
        {task.title}
      </button>
    );
  const commit = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== task.title) onSave(value.trim());
    else setValue(task.title);
  };
  return (
    <input
      autoFocus
      value={value}
      maxLength={300}
      aria-label="عنوان المهمة"
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") { setValue(task.title); setEditing(false); }
      }}
      className="media-input min-h-9 flex-1 py-1 text-sm"
    />
  );
}

export function TaskRow({ task, data, currentUser, onOpenIdea, compact, showIdea = true }: { task: PersonalTask; data: MediaData; currentUser: TeamMember; onOpenIdea?: (id: string) => void; compact?: boolean; showIdea?: boolean }) {
  const { run, error } = useAct();
  const board = useEngagement((store) => store.board);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<"assignee" | "due" | null>(null);
  const [note, setNote] = useState("");
  const today = riyadhDay();
  const assignee = data.members.find((member) => member.id === task.assigneeId);
  const idea = task.ideaId ? data.ideas.find((item) => item.id === task.ideaId) : undefined;
  const canEdit = canManageTasks(currentUser) || task.assigneeId === currentUser.id || task.createdBy === currentUser.id;
  const due = task.dueDate ? dueText(task.dueDate, today) : null;
  const updates = useMemo(() => (board?.updates || []).filter((update) => update.taskId === task.id), [board, task.id]);
  const patch = (fields: Record<string, unknown>) => run({ action: "updateTask", id: task.id, ...fields });
  const members = data.members.filter((member) => member.active && member.role !== "superadmin");
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.35, ease: EASE }} className={`rounded-2xl bg-white shadow-[0_0_0_1px_#E8EAF2] ${task.status === "doing" ? "shadow-[0_0_0_1px_#F2C98A]" : ""}`}>
      <div className={`flex items-center gap-2.5 ${compact ? "px-3 py-2" : "px-4 py-2.5"}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={task.status === "done"}
          aria-label={task.status === "done" ? `إعادة فتح ${task.title}` : `إنجاز ${task.title}`}
          disabled={!canEdit}
          onClick={() => patch({ status: task.status === "done" ? "todo" : "done" })}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${task.status === "done" ? "border-[#1E8A5F] bg-[#1E8A5F] text-white" : "border-[#C7CCD9] hover:border-[#1E8A5F]"}`}
        >
          {task.status === "done" && <Icon name="check" className="size-3.5" />}
        </button>
        <span className="size-2 shrink-0 rounded-full" style={{ background: PRIORITY_DOT[task.priority] }} title={TASK_PRIORITY_LABELS[task.priority]} />
        <InlineTitle key={task.title} task={task} canEdit={canEdit} onSave={(title) => void patch({ title })} />
        {task.ai.kind && !compact && (
          <span className="hidden items-center gap-1 rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[11px] text-[#5140B8] sm:inline-flex" title={task.ai.reason}>
            <Icon3D name="sparkle" className="size-3.5" />
            {TASK_KIND_LABELS[task.ai.kind]}
          </span>
        )}
        {task.status !== "done" && (
          <button type="button" disabled={!canEdit} onClick={() => patch({ status: NEXT_STATUS[task.status] === "done" ? "doing" : NEXT_STATUS[task.status] })} className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[task.status]}`} title="اضغط لتغيير الحالة">
            {TASK_STATUS_LABELS[task.status]}
          </button>
        )}
        {showIdea && idea && (
          <button type="button" onClick={() => onOpenIdea?.(idea.id)} className="hidden shrink-0 rounded-md bg-[#EAF7F5] px-2 py-0.5 text-[11px] text-[#11665E] hover:underline sm:inline" title={idea.title}>
            {idea.code}
          </button>
        )}
        <button type="button" disabled={!canEdit} onClick={() => setPick(pick === "due" ? null : "due")} className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] ${due ? (due.tone === "late" ? "bg-[#FDEDEE] text-[#8F1F33]" : due.tone === "today" ? "bg-[#FFF4E3] text-[#8A4B0A]" : "bg-[var(--background)] text-[var(--soft)]") : "text-[var(--soft)] hover:bg-[var(--background)]"}`} aria-label="موعد المهمة">
          {due ? due.label : canEdit ? "موعد؟" : ""}
        </button>
        <button type="button" disabled={!canEdit} onClick={() => setPick(pick === "assignee" ? null : "assignee")} aria-label={`المسؤول: ${assignee?.name || ""}`} className="shrink-0 rounded-full">
          <PersonAvatar member={assignee} size="sm" />
        </button>
        <button type="button" aria-expanded={open} aria-label="تفاصيل المهمة" onClick={() => setOpen(!open)} className="shrink-0 rounded-lg p-1 text-[var(--soft)] hover:bg-[var(--background)]">
          <Icon name="chevron" className={`size-4 transition-transform duration-300 ${open ? "rotate-90" : "-rotate-90"}`} />
        </button>
      </div>
      {pick === "assignee" && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {members.map((member) => (
            <button key={member.id} type="button" onClick={() => { setPick(null); void patch({ assigneeId: member.id }); }} aria-pressed={member.id === task.assigneeId} className={`inline-flex items-center gap-1.5 rounded-full py-1 ps-1 pe-3 text-xs ${member.id === task.assigneeId ? "bg-[#1D243C] text-white" : "bg-[var(--background)] hover:bg-[var(--accent)]"}`}>
              <PersonAvatar member={member} size="sm" showPresence={false} className="!size-6 !text-[10px]" />
              {member.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}
      {pick === "due" && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 text-xs">
          {[["اليوم", today], ["بكرة", addDays(today, 1)], ["بعد ٣ أيام", addDays(today, 3)], ["الأسبوع الجاي", addDays(today, 7)]].map(([label, value]) => (
            <button key={value} type="button" onClick={() => { setPick(null); void patch({ dueDate: value }); }} className="rounded-full bg-[var(--background)] px-3 py-1 hover:bg-[var(--accent)]">{label}</button>
          ))}
          <input type="date" aria-label="تاريخ محدد" className="media-input min-h-8 w-auto py-1 text-xs" defaultValue={task.dueDate || ""} onChange={(event) => { setPick(null); void patch({ dueDate: event.target.value || null }); }} />
          {task.dueDate && <button type="button" onClick={() => { setPick(null); void patch({ dueDate: null }); }} className="text-[var(--soft)] underline">بلا موعد</button>}
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
            <div className="space-y-3 border-t border-[var(--border)] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--soft)]">
                <button type="button" disabled={!canEdit} onClick={() => patch({ priority: NEXT_PRIORITY[task.priority] })} className="inline-flex items-center gap-1 rounded-md bg-[var(--background)] px-2 py-1"><span className="size-2 rounded-full" style={{ background: PRIORITY_DOT[task.priority] }} />{TASK_PRIORITY_LABELS[task.priority]}</button>
                <span className="rounded-md bg-[var(--background)] px-2 py-1">{TASK_KIND_LABELS[task.kind]}</span>
                {task.sequence && <span className="rounded-md bg-[var(--background)] px-2 py-1">الخطوة {arNum(task.sequence)}</span>}
                <span>أنشأها {data.members.find((member) => member.id === task.createdBy)?.name.split(" ")[0] || "—"} · {relativeTime(task.createdAt)}</span>
                {idea && !showIdea && <span>{idea.code}</span>}
                {canEdit && (
                  <button type="button" onClick={() => void run({ action: "deleteTask", id: task.id }, true)} className="ms-auto text-[var(--danger)] hover:underline">حذف</button>
                )}
              </div>
              {task.description && <p className="whitespace-pre-wrap text-[var(--soft)]">{task.description}</p>}
              {task.ai.reason && <p className="flex items-start gap-1.5 text-xs text-[#5140B8]"><Icon3D name="sparkle" className="size-4" />{task.ai.reason}</p>}
              {updates.length > 0 && (
                <ol className="space-y-1.5">
                  {updates.slice(0, 8).map((update) => <UpdateLine key={update.id} update={update} data={data} />)}
                </ol>
              )}
              {canEdit && (
                <form
                  className="flex items-center gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!note.trim()) return;
                    const text = note;
                    setNote("");
                    if (!(await run({ action: "updateTask", id: task.id, note: text }, true))) setNote(text);
                  }}
                >
                  <label htmlFor={`note-${task.id}`} className="sr-only">تحديث سريع</label>
                  <input id={`note-${task.id}`} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="اكتب تحديثاً قصيراً عن وضع المهمة…" className="media-input min-h-10 flex-1 text-sm" />
                  <ActionButton type="submit" disabled={!note.trim()} className="!min-h-10 !text-xs">تحديث</ActionButton>
                </form>
              )}
              {error && <p role="alert" className="text-xs text-[var(--danger)]">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function updateText(update: TaskUpdate, data: MediaData) {
  const name = (id: string) => data.members.find((member) => member.id === id)?.name.split(" ")[0] || "—";
  switch (update.kind) {
    case "created": return "أنشأ المهمة";
    case "status": return update.body === "done" ? "أنجز المهمة" : update.body === "doing" ? "بدأ العمل عليها" : "أعاد فتحها";
    case "assigned": return `أسندها إلى ${name(update.body)}`;
    case "due": return update.body ? `حدّد الموعد ${dueText(update.body, riyadhDay()).label}` : "أزال الموعد";
    case "note": return update.body;
    case "ai": return update.body;
    case "priority": return `الأولوية: ${TASK_PRIORITY_LABELS[update.body as TaskPriority] || update.body}`;
    case "linked": return update.body ? `ربطها بالفكرة ${data.ideas.find((idea) => idea.id === update.body)?.code || ""}` : "فك ربطها بالفكرة";
    case "title": return `غيّر العنوان إلى «${update.body}»`;
    default: return update.body;
  }
}

function UpdateLine({ update, data, withTask }: { update: TaskUpdate; data: MediaData; withTask?: PersonalTask }) {
  const actor = data.members.find((member) => member.id === update.actorId);
  const ai = update.kind === "ai";
  return (
    <li className="flex items-start gap-2 text-xs">
      {ai ? <Icon3D name="sparkle" className="size-5 shrink-0" /> : <PersonAvatar member={actor} size="sm" showPresence={false} className="!size-5 !text-[9px]" />}
      <span className="min-w-0 flex-1">
        {!ai && <b>{actor?.name.split(" ")[0] || "—"} </b>}
        <span className={update.kind === "note" ? "" : "text-[var(--soft)]"}>{updateText(update, data)}</span>
        {withTask && <span className="block truncate text-[var(--soft)]">{withTask.title}</span>}
      </span>
      <span className="shrink-0 text-[var(--soft)]">{relativeTime(update.at)}</span>
    </li>
  );
}

function groupTasks(visible: PersonalTask[], byIdea: boolean, data: MediaData) {
  if (!byIdea) return [{ key: "all", label: "", items: visible }];
  const groups = new Map<string, PersonalTask[]>();
  for (const task of visible) groups.set(task.ideaId || "", [...(groups.get(task.ideaId || "") || []), task]);
  return [...groups.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : 0)).map(([ideaId, items]) => ({ key: ideaId || "none", label: ideaId ? data.ideas.find((idea) => idea.id === ideaId)?.title || "فكرة" : "مهام عامة", items: [...items].sort((a, b) => (a.sequence || 99) - (b.sequence || 99)) }));
}

export function TaskBoardView({ data, currentUser, onOpenIdea }: { data: MediaData; currentUser: TeamMember; onOpenIdea: (id: string) => void }) {
  const { board, loadBoard } = useEngagement();
  const reduce = useReducedMotion();
  const manager = canManageTasks(currentUser);
  const [filter, setFilter] = useState<Filter>(manager ? "team" : "mine");
  const [member, setMember] = useState<string>("");
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) { loaded.current = true; void loadBoard(); }
  }, [loadBoard]);
  const today = riyadhDay();
  const tasks = board?.tasks || [];
  const visible = tasks.filter((task) => {
    if (member && task.assigneeId !== member) return false;
    switch (filter) {
      case "mine": return task.assigneeId === currentUser.id && task.status !== "done";
      case "created": return task.createdBy === currentUser.id && task.status !== "done";
      case "late": return task.status !== "done" && !!task.dueDate && task.dueDate < today;
      case "today": return task.status !== "done" && task.dueDate === today;
      case "done": return task.status === "done";
      default: return task.status !== "done";
    }
  });
  const counts = {
    mine: tasks.filter((task) => task.assigneeId === currentUser.id && task.status !== "done").length,
    created: tasks.filter((task) => task.createdBy === currentUser.id && task.status !== "done").length,
    late: tasks.filter((task) => task.status !== "done" && !!task.dueDate && task.dueDate < today).length,
    today: tasks.filter((task) => task.status !== "done" && task.dueDate === today).length,
    done: tasks.filter((task) => task.status === "done").length,
    team: tasks.filter((task) => task.status !== "done").length,
  };
  const staleBefore = Date.parse(useEngagement((store) => store.state?.now || "1970-01-01")) - 3 * 86_400_000;
  const stale = tasks.filter((task) => task.status === "doing" && Date.parse(task.updatedAt) < staleBefore).length;
  const doneWeek = (board?.load || []).reduce((sum, entry) => sum + entry.doneWeek, 0);
  const groups = groupTasks(visible, manager && filter !== "mine" && filter !== "created" && !member, data);
  const filters: [Filter, string][] = manager ? [["team", "كل الفريق"], ["mine", "لي"], ["late", "متأخرة"], ["today", "اليوم"], ["done", "منجزة"]] : [["mine", "لي"], ["created", "أنشأتها"], ["late", "متأخرة"], ["today", "اليوم"], ["done", "منجزة"]];
  return (
    <div className="flex flex-wrap items-start gap-6">
      <section className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
        <SmartAdd currentUser={currentUser} autoFocus />
        {manager && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["مفتوحة", counts.team, "#6250D8"], ["متأخرة", counts.late, "#BD384D"], ["أُنجزت هذا الأسبوع", doneWeek, "#1E8A5F"], ["بلا تحديث منذ ٣ أيام", stale, "#E08A1E"]].map(([label, value, color], index) => (
              <motion.div key={String(label)} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: index * 0.05 }} className="media-card p-3.5">
                <span className="block text-xs text-[var(--soft)]">{label}</span>
                <strong className="font-display text-3xl font-medium" style={{ color: String(color) }}>{arNum(Number(value))}</strong>
              </motion.div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {filters.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-200 ${filter === id ? "border-[#1D243C] bg-[#1D243C] text-white" : "border-[#E1E4EE] bg-white hover:bg-[var(--background)]"}`}>
              {label}
              <span className={`rounded-md px-1.5 text-xs ${filter === id ? "bg-white/15" : "bg-[var(--background)]"}`}>{arNum(counts[id])}</span>
            </button>
          ))}
          {manager && (
            <select aria-label="تصفية حسب العضو" value={member} onChange={(event) => setMember(event.target.value)} className="media-input ms-auto min-h-10 w-auto py-1 text-sm">
              <option value="">كل الأعضاء</option>
              {data.members.filter((item) => item.active && item.role !== "superadmin").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          )}
        </div>
        {!board && <p role="status" className="text-sm text-[var(--soft)]">جارٍ تحميل المهام…</p>}
        {board && visible.length === 0 && (
          <div className="media-card flex items-center gap-3 p-5 text-[var(--soft)]">
            <Icon3D name="check" className="size-9" />
            {filter === "done" ? "لا توجد مهام منجزة بعد." : filter === "late" ? "لا توجد مهام متأخرة. ممتاز!" : "لا توجد مهام هنا. اكتب مهمة في السطر أعلاه وانتر."}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            {group.label && groups.length > 1 && <h2 className="!text-sm font-bold text-[var(--soft)]">{group.label}</h2>}
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {group.items.map((task) => <TaskRow key={task.id} task={task} data={data} currentUser={currentUser} onOpenIdea={onOpenIdea} />)}
              </AnimatePresence>
            </ul>
          </div>
        ))}
      </section>
      {manager && board && (
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section className="media-card space-y-3 p-4">
            <strong className="flex items-center gap-2"><Icon3D name="team" className="size-6" />حِمل الفريق</strong>
            <ul className="space-y-2">
              {board.load.sort((a, b) => b.open - a.open).map((entry) => {
                const person = data.members.find((item) => item.id === entry.memberId);
                return (
                  <li key={entry.memberId}>
                    <button type="button" onClick={() => setMember(member === entry.memberId ? "" : entry.memberId)} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start text-sm ${member === entry.memberId ? "bg-[var(--accent)]" : "hover:bg-[var(--background)]"}`}>
                      <PersonAvatar member={person} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{person?.name}</span>
                      <span className="text-xs text-[var(--soft)]">{arNum(entry.open)} مفتوحة{entry.overdue ? <span className="text-[#BD384D]"> · {arNum(entry.overdue)} متأخرة</span> : null}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="media-card space-y-3 p-4">
            <strong className="flex items-center gap-2"><Icon3D name="bolt" className="size-6" />آخر التحديثات</strong>
            <ol className="space-y-2.5">
              {board.updates.slice(0, 20).map((update) => <UpdateLine key={update.id} update={update} data={data} withTask={tasks.find((task) => task.id === update.taskId)} />)}
              {!board.updates.length && <li className="text-xs text-[var(--soft)]">لا تحديثات بعد.</li>}
            </ol>
          </section>
        </aside>
      )}
    </div>
  );
}

/** Tasks of one idea with AI-suggested plan. */
export function IdeaTasks({ ideaId, data, currentUser }: { ideaId: string; data: MediaData; currentUser: TeamMember }) {
  const { board, loadBoard, state } = useEngagement();
  const { run, error } = useAct();
  const [suggestions, setSuggestions] = useState<{ title: string; assigneeId: string | null; dueDate: string | null; priority: TaskPriority; kind: PersonalTask["kind"]; sequence: number; reason: string; on: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) { loaded.current = true; void loadBoard(); }
  }, [loadBoard]);
  const tasks = (board?.tasks || []).filter((task) => task.ideaId === ideaId).sort((a, b) => (a.sequence || 99) - (b.sequence || 99));
  const idea = data.ideas.find((item) => item.id === ideaId);
  const canPlan = state?.ai.available && (canManageTasks(currentUser) || idea?.ownerId === currentUser.id || idea?.designerId === currentUser.id);
  const suggest = async () => {
    setBusy(true);
    const result = (await run({ action: "suggestTasks", ideaId })) as { suggestions: typeof suggestions } | null;
    setBusy(false);
    if (result?.suggestions) setSuggestions(result.suggestions.map((item) => ({ ...item, on: true })));
  };
  const accept = async () => {
    if (!suggestions) return;
    setBusy(true);
    const chosen = suggestions.filter((item) => item.on).map((item) => ({ title: item.title, assigneeId: item.assigneeId, dueDate: item.dueDate, priority: item.priority, kind: item.kind, sequence: item.sequence }));
    const result = await run({ action: "acceptTasks", ideaId, tasks: chosen }, true);
    setBusy(false);
    if (result) setSuggestions(null);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--soft)]">{tasks.length ? `${arNum(tasks.filter((task) => task.status === "done").length)} من ${arNum(tasks.length)} منجزة` : "لا مهام مرتبطة بهذه الفكرة بعد."}</p>
        {canPlan && !suggestions && (
          <ActionButton disabled={busy} onClick={() => void suggest()}>
            <Icon3D name="sparkle" className="size-5" />
            {busy ? "جارٍ اقتراح الخطة…" : tasks.length ? "اقترح مهام إضافية" : "اقترح خطة التنفيذ"}
          </ActionButton>
        )}
      </div>
      {suggestions && (
        <div className="space-y-2 rounded-2xl border border-[#D9D3FA] bg-[#fbfaff] p-4">
          <strong className="flex items-center gap-2 text-sm"><Icon3D name="sparkle" className="size-5" />خطة مقترحة · عدّل ما تريد ثم أضف الكل بضغطة</strong>
          <ul className="space-y-1.5">
            {suggestions.map((item, index) => (
              <li key={index} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={item.on} aria-label={`اعتماد ${item.title}`} onChange={(event) => setSuggestions(suggestions.map((entry, position) => (position === index ? { ...entry, on: event.target.checked } : entry)))} className="size-4 accent-[var(--primary)]" />
                <span className="rounded-md bg-[var(--background)] px-1.5 text-xs">{arNum(item.sequence)}</span>
                <span className="min-w-0 flex-1 truncate" title={item.reason}>{item.title}</span>
                <span className="text-xs text-[var(--soft)]">{data.members.find((member) => member.id === item.assigneeId)?.name.split(" ")[0] || "أنا"} · {item.dueDate ? dueText(item.dueDate, riyadhDay()).label : ""}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <ActionButton onClick={() => setSuggestions(null)} disabled={busy}>إلغاء</ActionButton>
            <ActionButton primary disabled={busy || !suggestions.some((item) => item.on)} onClick={() => void accept()}>{busy ? "جارٍ الإضافة…" : `إضافة ${arNum(suggestions.filter((item) => item.on).length)} مهام`}</ActionButton>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {tasks.map((task) => <TaskRow key={task.id} task={task} data={data} currentUser={currentUser} showIdea={false} compact />)}
        </AnimatePresence>
      </ul>
      <SmartAdd currentUser={currentUser} ideaId={ideaId} compact placeholder="مهمة جديدة لهذه الفكرة… وانتر" />
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}

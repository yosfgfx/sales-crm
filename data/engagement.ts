export type AddressForm = "m" | "f";

export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "urgent" | "high" | "normal" | "low";
export type TaskKind = "content" | "design" | "review" | "coordination" | "meeting" | "personal" | "other";
export interface TaskAi { kind?: TaskKind; reason?: string; ideaCode?: string; confidence?: number; model?: string; at?: string }
export interface PersonalTask {
  id: string; title: string; description: string; dueDate: string | null; doneAt: string | null; ideaId: string | null; meetingId: string | null;
  source: "quick" | "meeting" | "plan" | "ai"; createdAt: string; createdBy: string; assigneeId: string;
  status: TaskStatus; priority: TaskPriority; kind: TaskKind; sequence: number | null; lastUpdate: string; updatedAt: string; ai: TaskAi; fields: Record<string, string>;
}
export interface TaskUpdate { id: string; taskId: string; actorId: string; kind: "created" | "status" | "assigned" | "due" | "note" | "ai" | "priority" | "linked" | "title" | "deleted"; body: string; at: string }
export interface TaskBoard { tasks: PersonalTask[]; updates: TaskUpdate[]; load: { memberId: string; open: number; overdue: number; doneWeek: number }[] }
export const TASK_KIND_LABELS: Record<TaskKind, string> = { content: "محتوى", design: "تصميم", review: "مراجعة", coordination: "تنسيق", meeting: "اجتماع", personal: "شخصي", other: "عام" };
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { todo: "لم تبدأ", doing: "جارية", done: "منجزة" };
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { urgent: "عاجلة", high: "مهمة", normal: "عادية", low: "منخفضة" };
export interface AiStatus { configured: boolean; enabled: boolean; budgetUsd: number; spentUsd: number; calls: number; model: string; effort: "low" | "medium" | "high"; instructions: string; available: boolean; reason?: string }
export interface TaskSuggestion { title: string; kind: TaskKind; assigneeId: string | null; dueDate: string | null; priority: TaskPriority; sequence: number; reason: string }
export interface WorkSession { id: string; memberId: string; ideaId: string | null; taskId: string | null; label: string; startedAt: string; endedAt: string | null; seconds: number | null }
export interface MeetingItem { id: string; kind: "agenda" | "decision" | "action"; text: string; ideaId: string | null; assigneeId: string | null; taskId: string | null; done: boolean; sort: number; createdBy: string; createdAt: string }
export interface MeetingAttendance { memberId: string; joinedAt: string; leftAt: string | null }
export interface Meeting { id: string; title: string; startsAt: string; durationMinutes: number; teamsUrl: string | null; notes: string; status: "scheduled" | "live" | "ended" | "cancelled"; createdBy: string; createdAt: string; updatedAt: string; items: MeetingItem[]; attendance: MeetingAttendance[] }

export interface HonorBreakdown { completion: number; onTime: number; response: number; participation: number }
export interface HonorEntry { memberId: string; score: number; delivered: number; onTimeRate: number | null; responseHours: number | null; messages: number; activeDays: number; meetings: number; breakdown: HonorBreakdown }
export interface HonorAward { month: string; memberId: string; score: number; summary: string; announcedAt: string; cheers: number; cheered: boolean; breakdown?: HonorBreakdown }
export interface HonorBoard { month: string; podium: { memberId: string; rank: number }[]; ranking?: HonorEntry[]; current?: HonorAward | null; past: HonorAward[] }

export interface DayActivity { day: string; minutes: number }
export interface MemberProfile {
  memberId: string; delivered: number; onTimeRate: number | null; averageCompletionDays: number | null; responseHours: number | null;
  ideasCreated: number; messages: number; reactions: number; comments: number; meetingsAttended: number;
  activeDays: number; workDays: number; activityRate: number; heatmap: DayActivity[]; honor: HonorEntry | null; focusMinutes: number; lastSeenAt: string | null;
}

export interface EngagementState {
  now: string;
  tasks: PersonalTask[];
  session: WorkSession | null;
  team: { memberId: string; lastSeenAt: string | null; working: { ideaId: string | null; label: string; startedAt: string } | null }[];
  focus: { label: string; minutes: number; ideaId: string | null }[];
  week: { day: string; done: number }[];
  streak: number;
  meetings: Meeting[];
  honor: HonorBoard;
  welcome: { show: boolean; previousVisitAt: string | null };
  push: { publicKey: string | null; subscribed: number };
  ai: { available: boolean };
}

export const HONOR_WEIGHTS = { completion: 35, onTime: 25, response: 15, participation: 25 } as const;

export function addressed(form: AddressForm | undefined, masculine: string, feminine: string) {
  return form === "f" ? feminine : masculine;
}

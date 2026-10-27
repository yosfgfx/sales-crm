import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { engagementAction, loadEngagement, loadProfile } from "../engagement";
import { internal, jsonRequest, names, tool, type McpContext } from "./context";
import { loadReference } from "../repository";
import { loadTaskBoard } from "../tasks";
import { database } from "../db";

export function registerEngagementTools(server: McpServer, ctx: McpContext) {
  const read = { readOnlyHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const act = (body: Record<string, unknown>) => engagementAction(jsonRequest(ctx, "/api/engagement", body));

  server.registerTool("my_day", {
    title: "يومي", description: "Your personal day: tasks, running focus session, focus time this week, streak, upcoming meetings, who is online and what they work on, and the honor board podium.", inputSchema: {}, annotations: read,
  }, tool(ctx, "my_day", async () => {
    const state = await loadEngagement(internal(ctx, "/api/engagement"));
    const label = names(await loadReference(database()));
    return {
      tasks: state.tasks, session: state.session, focus: state.focus, streak: state.streak, week: state.week,
      team: state.team.map((entry) => ({ member: label.member(entry.memberId), memberId: entry.memberId, lastSeenAt: entry.lastSeenAt, working: entry.working })),
      meetings: state.meetings.map((meeting) => ({ id: meeting.id, title: meeting.title, startsAt: meeting.startsAt, status: meeting.status, teamsUrl: meeting.teamsUrl, agenda: meeting.items.filter((item) => item.kind === "agenda").map((item) => item.text) })),
      honor: { month: state.honor.month, podium: state.honor.podium.map((entry) => ({ rank: entry.rank, member: label.member(entry.memberId) })), lastWinner: state.honor.current ? label.member(state.honor.current.memberId) : null, ranking: state.honor.ranking },
    };
  }));

  server.registerTool("add_task", {
    title: "إضافة مهمة", description: "Create a task, optionally for another member (assigneeId) and linked to an idea (ideaId). Natural text works too: «@سارة تجهيز نص الحملة بكرة #IC-2026-012». With smart=true (default) the platform's AI classifies the task, links it to the right idea and sets the sequence step.",
    inputSchema: { title: z.string().min(1).max(600), assigneeId: z.string().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), ideaId: z.string().optional(), priority: z.enum(["urgent", "high", "normal", "low"]).optional(), kind: z.enum(["content", "design", "review", "coordination", "meeting", "personal", "other"]).optional(), description: z.string().max(4000).optional(), smart: z.boolean().default(true) }, annotations: write,
  }, tool(ctx, "add_task", async ({ smart, ...args }: { title: string; smart: boolean; assigneeId?: string; dueDate?: string; ideaId?: string; priority?: string; kind?: string; description?: string }) => {
    const id = randomUUID();
    const created = await act({ action: "addTask", id, ...args }) as { task: unknown };
    if (!smart) return created.task;
    try { return (await act({ action: "enrichTask", id, text: args.title }) as { task: unknown }).task; } catch { return created.task; }
  }));

  server.registerTool("list_tasks", { title: "قائمة المهام", description: "Tasks you can see (yours, ones you created, ones on your ideas; managers and administrators see the whole team), with the latest updates and per-member load.", inputSchema: { status: z.enum(["todo", "doing", "done"]).optional(), assigneeId: z.string().optional(), ideaId: z.string().optional() }, annotations: read },
    tool(ctx, "list_tasks", async (args: { status?: string; assigneeId?: string; ideaId?: string }) => {
      const board = await loadTaskBoard(database(), ctx.member);
      const label = names(await loadReference(database()));
      const tasks = board.tasks.filter((task) => (!args.status || task.status === args.status) && (!args.assigneeId || task.assigneeId === args.assigneeId) && (!args.ideaId || task.ideaId === args.ideaId));
      return { tasks: tasks.map((task) => ({ ...task, assignee: label.member(task.assigneeId) })), updates: board.updates.slice(0, 30).map((update) => ({ ...update, actor: label.member(update.actorId) })), load: board.load.map((entry) => ({ ...entry, member: label.member(entry.memberId) })) };
    }));

  server.registerTool("update_task", { title: "تحديث مهمة", description: "Change a task's status (todo/doing/done), assignee, due date, priority, idea link or title, and/or post a progress note (note) that the assignee and creator are notified about.", inputSchema: { taskId: z.string(), status: z.enum(["todo", "doing", "done"]).optional(), assigneeId: z.string().optional(), dueDate: z.string().nullable().optional(), priority: z.enum(["urgent", "high", "normal", "low"]).optional(), ideaId: z.string().nullable().optional(), title: z.string().max(300).optional(), note: z.string().max(2000).optional() }, annotations: write },
    tool(ctx, "update_task", async ({ taskId, ...patch }: Record<string, unknown> & { taskId: string }) => (await act({ action: "updateTask", id: taskId, ...patch }) as { task: unknown }).task));

  server.registerTool("complete_task", { title: "إنجاز مهمة", description: "Mark a task done (or reopen it).", inputSchema: { taskId: z.string(), done: z.boolean().default(true) }, annotations: write },
    tool(ctx, "complete_task", async ({ taskId, done }: { taskId: string; done: boolean }) => act({ action: "toggleTask", id: taskId, done })));

  server.registerTool("plan_idea_tasks", { title: "اقتراح خطة مهام لفكرة", description: "Ask the platform's AI for a short, sequenced task plan for an idea (content → approval → design → delivery), then create the accepted ones with apply=true.", inputSchema: { ideaId: z.string(), apply: z.boolean().default(false) }, annotations: write },
    tool(ctx, "plan_idea_tasks", async ({ ideaId, apply }: { ideaId: string; apply: boolean }) => {
      const { suggestions } = await act({ action: "suggestTasks", ideaId }) as { suggestions: unknown[] };
      if (!apply) return { suggestions };
      return act({ action: "acceptTasks", ideaId, tasks: suggestions });
    }));

  server.registerTool("focus_session", { title: "مؤقت التركيز", description: "Start a focus session on an idea or task, or stop the running one.", inputSchema: { action: z.enum(["start", "stop"]), ideaId: z.string().optional(), taskId: z.string().optional(), label: z.string().max(300).optional() }, annotations: write },
    tool(ctx, "focus_session", async (args: { action: "start" | "stop"; ideaId?: string; taskId?: string; label?: string }) => act(args.action === "stop" ? { action: "stopSession" } : { action: "startSession", ideaId: args.ideaId, taskId: args.taskId, label: args.label })));

  server.registerTool("create_meeting", {
    title: "إنشاء اجتماع", description: "Manager or administrator: schedule a team meeting (remote workday). Everyone is notified and reminded before it starts. startsAt is ISO 8601 with timezone (Riyadh is +03:00).",
    inputSchema: { title: z.string().min(1).max(200), startsAt: z.string().regex(/(Z|[+-]\d{2}:\d{2})$/, "Include the timezone, e.g. 2026-10-14T11:00:00+03:00"), durationMinutes: z.number().int().min(5).max(600).default(45), teamsUrl: z.string().url().optional(), agenda: z.array(z.object({ text: z.string().min(1).max(1000), ideaId: z.string().optional() })).max(30).optional() }, annotations: write,
  }, tool(ctx, "create_meeting", async (args: Record<string, unknown>) => act({ action: "createMeeting", id: randomUUID(), ...args })));

  server.registerTool("update_meeting", {
    title: "تحديث اجتماع", description: "Update meeting notes, or (manager) its title, time, Teams link or status (scheduled, live, ended, cancelled).",
    inputSchema: { meetingId: z.string(), notes: z.string().max(20000).optional(), title: z.string().max(200).optional(), startsAt: z.string().optional(), durationMinutes: z.number().int().optional(), teamsUrl: z.string().optional(), status: z.enum(["scheduled", "live", "ended", "cancelled"]).optional() }, annotations: write,
  }, tool(ctx, "update_meeting", async ({ meetingId, ...rest }: Record<string, unknown> & { meetingId: string }) => act({ action: "updateMeeting", id: meetingId, ...rest })));

  server.registerTool("add_meeting_item", {
    title: "إضافة بند أو قرار أو مهمة للاجتماع", description: "Add an agenda item, a decision, or an action item to a meeting. An action with assigneeId also becomes a task in that member's day.",
    inputSchema: { meetingId: z.string(), kind: z.enum(["agenda", "decision", "action"]), text: z.string().min(1).max(1000), ideaId: z.string().optional(), assigneeId: z.string().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }, annotations: write,
  }, tool(ctx, "add_meeting_item", async (args: Record<string, unknown>) => act({ action: "addMeetingItem", ...args })));

  server.registerTool("member_profile", { title: "لوحة إنجاز عضو", description: "Administrator or department manager: a member's achievement dashboard for the last 30 days (deliveries, on-time rate, response time, contributions, activity heatmap, honor score).", inputSchema: { memberId: z.string() }, annotations: read },
    tool(ctx, "member_profile", async ({ memberId }: { memberId: string }) => loadProfile(internal(ctx, `/api/engagement?profile=${encodeURIComponent(memberId)}`), memberId)));
}

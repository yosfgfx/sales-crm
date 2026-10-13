import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { engagementAction, loadEngagement, loadProfile } from "../engagement";
import { internal, jsonRequest, names, tool, type McpContext } from "./context";
import { loadReference } from "../repository";
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

  server.registerTool("add_task", { title: "إضافة مهمة شخصية", description: "Add a task to your own day plan.", inputSchema: { title: z.string().min(1).max(300), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), ideaId: z.string().optional() }, annotations: write },
    tool(ctx, "add_task", async (args: { title: string; dueDate?: string; ideaId?: string }) => { const id = randomUUID(); await act({ action: "addTask", id, ...args }); return { id }; }));

  server.registerTool("complete_task", { title: "إنجاز مهمة", description: "Mark one of your tasks done (or not done).", inputSchema: { taskId: z.string(), done: z.boolean().default(true) }, annotations: write },
    tool(ctx, "complete_task", async ({ taskId, done }: { taskId: string; done: boolean }) => act({ action: "toggleTask", id: taskId, done })));

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

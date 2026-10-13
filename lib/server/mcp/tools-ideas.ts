import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STATUS_LABELS, ideaHasCompany, type IdeaStatus, type MediaData } from "@/data/media";
import { confirmWithAuthenticator } from "../auth";
import { database } from "../db";
import { MediaServerError } from "../http";
import { runOperation } from "../ops";
import { loadReference } from "../repository";
import { loadIdeaFor, loadStateFor } from "../state";
import { detail, isOverdue, jsonRequest, summary, today, tool, type McpContext } from "./context";

const STATUSES = Object.keys(STATUS_LABELS) as [IdeaStatus, ...IdeaStatus[]];
const channels = z.array(z.enum(["screens", "whatsapp", "email"])).min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const priority = z.enum(["urgent", "high", "normal", "low"]);
const workType = z.enum(["motion", "video", "design", "report", "presentation", "document"]);

export async function fullIdea(ctx: McpContext, ideaId: string) {
  const db = database();
  const [idea, reference] = await Promise.all([loadIdeaFor(ctx.member, ideaId, db), loadReference(db)]);
  if (!idea) throw new MediaServerError("لم يتم العثور على الفكرة.", 404, "NOT_FOUND");
  return detail(idea, { ...reference, ideas: [], notifications: [] }, ctx.origin);
}

export async function operate(ctx: McpContext, body: Record<string, unknown>) {
  const result = await runOperation(jsonRequest(ctx, "/api/ops", body));
  if (result.deletedIdeaId) return { deleted: result.deletedIdeaId };
  if (result.idea) {
    const reference = await loadReference(database());
    return detail(result.idea, { ...reference, ideas: [], notifications: [] }, ctx.origin);
  }
  const { notifications: _ignored, ...rest } = result;
  void _ignored;
  return rest;
}

async function state(ctx: McpContext, options: { trash?: boolean } = {}): Promise<MediaData> {
  const data = (await loadStateFor(ctx.member)).data;
  return { ...data, ideas: data.ideas.filter((idea) => (options.trash ? Boolean(idea.deletedAt) : !idea.deletedAt)) };
}

export function registerIdeaTools(server: McpServer, ctx: McpContext) {
  const read = { readOnlyHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  server.registerTool("wasl_overview", { title: "نظرة عامة", description: "Snapshot of the Wasl workspace: counts per status, overdue work, ideas waiting for approval, deliveries this month. Start here.", inputSchema: {}, annotations: read },
    tool(ctx, "wasl_overview", async () => {
      const data = await state(ctx);
      const month = today().slice(0, 7);
      const counts = Object.fromEntries(STATUSES.map((status) => [status, data.ideas.filter((idea) => idea.status === status).length]));
      return {
        today: today(), viewer: { id: ctx.member.id, name: ctx.member.name, role: ctx.member.role }, totalIdeas: data.ideas.length, countsByStatus: counts,
        overdue: data.ideas.filter((idea) => isOverdue(idea)).map((idea) => summary(idea, data)),
        awaitingApproval: data.ideas.filter((idea) => idea.status === "review").map((idea) => summary(idea, data)),
        deliveredThisMonth: data.ideas.filter((idea) => idea.status === "delivered" && (idea.deliveredAt || "").startsWith(month)).length,
        unreadNotifications: data.notifications.filter((notice) => !notice.read && notice.recipientId === ctx.member.id).length,
      };
    }));

  server.registerTool("list_ideas", {
    title: "قائمة الأفكار", description: "List and filter ideas. Text search matches title, code, description and department. Returns compact rows; use get_idea for full details.",
    inputSchema: {
      status: z.array(z.enum(STATUSES)).optional().describe("Filter by one or more statuses"), companyId: z.string().optional(), categoryId: z.string().optional(),
      ownerId: z.string().optional(), designerId: z.string().optional(), query: z.string().optional(), overdueOnly: z.boolean().optional(),
      dueBefore: date.optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(),
      inTrash: z.boolean().optional().describe("Administrator: list ideas in the trash instead"),
    }, annotations: read,
  }, tool(ctx, "list_ideas", async (args: { status?: IdeaStatus[]; companyId?: string; categoryId?: string; ownerId?: string; designerId?: string; query?: string; overdueOnly?: boolean; dueBefore?: string; limit?: number; offset?: number; inTrash?: boolean }) => {
    const data = await state(ctx, { trash: args.inTrash });
    const query = args.query?.trim().toLowerCase();
    const rows = data.ideas.filter((idea) => (!args.status?.length || args.status.includes(idea.status))
      && (!args.companyId || ideaHasCompany(idea, args.companyId)) && (!args.categoryId || idea.categoryId === args.categoryId)
      && (!args.ownerId || idea.ownerId === args.ownerId) && (!args.designerId || idea.designerId === args.designerId)
      && (!args.overdueOnly || isOverdue(idea)) && (!args.dueBefore || (idea.dueDate && idea.dueDate <= args.dueBefore))
      && (!query || [idea.title, idea.code, idea.description, idea.department].some((field) => field.toLowerCase().includes(query))));
    const offset = args.offset || 0, limit = args.limit || 50;
    return { total: rows.length, offset, ideas: rows.slice(offset, offset + limit).map((idea) => summary(idea, data)) };
  }));

  server.registerTool("get_idea", { title: "تفاصيل فكرة", description: "Full details of one idea: content, plan, files with download URLs, quotations (if your role may see them), and the full history.", inputSchema: { ideaId: z.string() }, annotations: read },
    tool(ctx, "get_idea", async ({ ideaId }: { ideaId: string }) => fullIdea(ctx, ideaId)));

  server.registerTool("create_idea", {
    title: "إنشاء فكرة", description: "Create a new idea as a draft. Use list_reference for valid company and category ids and list_team for member ids. ownerId defaults to you.",
    inputSchema: {
      title: z.string().min(1), companyId: z.string().describe("Primary company id"), companyIds: z.array(z.string()).max(50).optional().describe("All companies the work serves, primary first"), allCompanies: z.boolean().optional().describe("True when the work serves every company"), department: z.string().min(1), categoryId: z.string(), workType, description: z.string().default(""),
      content: z.string().min(1), executionPlan: z.string().min(1), channels, ownerId: z.string().optional(), requestedAt: date.optional(), dueDate: date, priority: priority.default("normal"), needsQuotes: z.boolean().default(false),
    }, annotations: write,
  }, tool(ctx, "create_idea", async (args: Record<string, unknown>) => operate(ctx, { type: "createIdea", input: { ...args, ownerId: args.ownerId || ctx.member.id, requestedAt: args.requestedAt || today() } })));

  server.registerTool("update_idea", {
    title: "تعديل فكرة", description: "Edit idea fields while it is editable (draft, quotations, changes). Only send fields you want to change.",
    inputSchema: {
      ideaId: z.string(), title: z.string().optional(), companyId: z.string().optional(), companyIds: z.array(z.string()).max(50).optional(), allCompanies: z.boolean().optional(), department: z.string().optional(), categoryId: z.string().optional(), workType: workType.optional(),
      description: z.string().optional(), content: z.string().optional(), executionPlan: z.string().optional(), channels: channels.optional(), ownerId: z.string().optional(),
      requestedAt: date.optional(), dueDate: date.optional(), priority: priority.optional(), needsQuotes: z.boolean().optional(),
    }, annotations: write,
  }, tool(ctx, "update_idea", async ({ ideaId, ...patch }: Record<string, unknown> & { ideaId: string }) => operate(ctx, { type: "patchIdea", ideaId, patch })));

  server.registerTool("submit_idea", { title: "إرسال للاعتماد", description: "Send an idea to the manager for approval.", inputSchema: { ideaId: z.string() }, annotations: write },
    tool(ctx, "submit_idea", async ({ ideaId }: { ideaId: string }) => operate(ctx, { type: "submitIdea", ideaId })));
  server.registerTool("withdraw_idea", { title: "سحب من الاعتماد", description: "Pull an idea back from review to draft.", inputSchema: { ideaId: z.string() }, annotations: write },
    tool(ctx, "withdraw_idea", async ({ ideaId }: { ideaId: string }) => operate(ctx, { type: "withdrawIdea", ideaId })));

  server.registerTool("review_idea", {
    title: "قرار الاعتماد", description: "Manager decision on an idea in review: approve, send back for changes (feedback required) or reject permanently (reason required). The owner cannot approve their own idea.",
    inputSchema: { ideaId: z.string(), decision: z.enum(["approved", "changes", "rejected"]), feedback: z.string().optional() }, annotations: { ...write, destructiveHint: true },
  }, tool(ctx, "review_idea", async ({ ideaId, decision, feedback }: { ideaId: string; decision: string; feedback?: string }) => operate(ctx, { type: "reviewIdea", ideaId, decision, feedback })));

  server.registerTool("schedule_idea", {
    title: "جدولة التنفيذ", description: "Assign the designer and set the start date (and optionally due date and priority) for an approved idea.",
    inputSchema: { ideaId: z.string(), designerId: z.string(), scheduledAt: date, dueDate: date.optional(), priority: priority.optional() }, annotations: write,
  }, tool(ctx, "schedule_idea", async ({ ideaId, ...input }: { ideaId: string; designerId: string; scheduledAt: string; dueDate?: string; priority?: string }) => operate(ctx, { type: "scheduleIdea", ideaId, input })));

  server.registerTool("set_design_status", {
    title: "مرحلة التصميم", description: "Move design work forward: designing (start), design_review (designer's final check) or delivered (final delivery; needs a final file per channel and triggers Google Drive archiving).",
    inputSchema: { ideaId: z.string(), status: z.enum(["designing", "design_review", "delivered"]) }, annotations: write,
  }, tool(ctx, "set_design_status", async ({ ideaId, status }: { ideaId: string; status: string }) => operate(ctx, { type: "changeDesignStatus", ideaId, status })));

  server.registerTool("add_comment", { title: "إضافة تعليق", description: "Add a comment to an idea's history; the responsible members are notified.", inputSchema: { ideaId: z.string(), text: z.string().min(1).max(4000) }, annotations: write },
    tool(ctx, "add_comment", async ({ ideaId, text }: { ideaId: string; text: string }) => operate(ctx, { type: "addComment", ideaId, text })));

  server.registerTool("add_quotation", {
    title: "إضافة عرض سعر", description: "Add a vendor quotation to an idea. attachmentId optionally links an already uploaded quotation file (kind=quotation).",
    inputSchema: { ideaId: z.string(), vendor: z.string().min(1), amount: z.number().positive(), scope: z.string().min(1), days: z.number().int().min(1), recommended: z.boolean().default(false), attachmentId: z.string().optional() }, annotations: write,
  }, tool(ctx, "add_quotation", async ({ ideaId, ...quote }: { ideaId: string; vendor: string; amount: number; scope: string; days: number; recommended: boolean; attachmentId?: string }) =>
    operate(ctx, { type: "addQuotation", ideaId, quote: { id: crypto.randomUUID(), ...quote } })));
  server.registerTool("remove_quotation", { title: "حذف عرض سعر", description: "Remove a quotation from an idea.", inputSchema: { ideaId: z.string(), quotationId: z.string() }, annotations: { ...write, destructiveHint: true } },
    tool(ctx, "remove_quotation", async ({ ideaId, quotationId }: { ideaId: string; quotationId: string }) => operate(ctx, { type: "removeQuotation", ideaId, quotationId })));

  server.registerTool("reassign_idea", { title: "إعادة إسناد", description: "Administrator: change the content owner and/or designer of an open idea.", inputSchema: { ideaId: z.string(), ownerId: z.string().optional(), designerId: z.string().optional() }, annotations: write },
    tool(ctx, "reassign_idea", async ({ ideaId, ownerId, designerId }: { ideaId: string; ownerId?: string; designerId?: string }) => operate(ctx, { type: "reassignIdea", ideaId, ownerId, designerId })));
  server.registerTool("cancel_idea", { title: "إلغاء فكرة", description: "Cancel an idea (kept in history, can be reopened by an administrator). A reason is required.", inputSchema: { ideaId: z.string(), reason: z.string().min(1) }, annotations: { ...write, destructiveHint: true } },
    tool(ctx, "cancel_idea", async ({ ideaId, reason }: { ideaId: string; reason: string }) => operate(ctx, { type: "cancelIdea", ideaId, reason })));
  server.registerTool("reopen_idea", { title: "إعادة فتح", description: "Administrator: reopen a cancelled, rejected or delivered idea. A reason is required.", inputSchema: { ideaId: z.string(), reason: z.string().min(1) }, annotations: write },
    tool(ctx, "reopen_idea", async ({ ideaId, reason }: { ideaId: string; reason: string }) => operate(ctx, { type: "reopenIdea", ideaId, reason })));
  server.registerTool("delete_idea", {
    title: "نقل فكرة إلى سلة المحذوفات", description: "System administrator or department manager: move an idea to the trash (an administrator can restore it with restore_idea; files and history are kept). Ask the user first; it needs a fresh 6-digit code from their authenticator app.",
    inputSchema: { ideaId: z.string(), reason: z.string().optional(), authenticatorCode: z.string().regex(/^\d{6}$/).describe("Fresh code from the user's authenticator app") }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, tool(ctx, "delete_idea", async ({ ideaId, reason, authenticatorCode }: { ideaId: string; reason?: string; authenticatorCode: string }) => {
    await confirmWithAuthenticator(ctx.member.id, authenticatorCode);
    return operate(ctx, { type: "deleteIdea", ideaId, reason });
  }));

  server.registerTool("restore_idea", {
    title: "استعادة فكرة من السلة", description: "Administrator: restore an idea from the trash. Optionally pick a replacement owner or designer if the original ones are no longer active.",
    inputSchema: { ideaId: z.string(), ownerId: z.string().optional(), designerId: z.string().optional() }, annotations: write,
  }, tool(ctx, "restore_idea", async ({ ideaId, ownerId, designerId }: { ideaId: string; ownerId?: string; designerId?: string }) => operate(ctx, { type: "restoreIdea", ideaId, ...(ownerId ? { ownerId } : {}), ...(designerId ? { designerId } : {}) })));
}

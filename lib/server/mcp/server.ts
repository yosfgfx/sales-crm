import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpContext } from "./context";
import { registerAdminTools } from "./tools-admin";
import { fullIdea, registerIdeaTools } from "./tools-ideas";

const INSTRUCTIONS = `Wasl (وصل) is the internal-communications workspace of the corporate communication team (Arabic UI, Asia/Riyadh time).
Workflow: draft → (quotations) → review → approved → scheduled → designing → design_review → delivered. Ideas can also be changes (sent back), rejected, or cancelled.
Roles: content writes ideas; manager approves ideas and content (never their own); designer schedules, designs and delivers (the design belongs to the designer); admin/superadmin can do everything.
Delivered work is archived automatically to Google Drive (year/month/company/project).
Every tool runs with the permissions of the connected account. Start with wasl_overview, use list_reference and list_team for ids.
Before any irreversible action (delete_idea, reject, deactivating an account, applying an import), describe it and get the user's explicit confirmation. Reply to the user in Arabic.`;

export function createWaslServer(ctx: McpContext) {
  const server = new McpServer({ name: "wasl", title: "وصل", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerIdeaTools(server, ctx);
  registerAdminTools(server, ctx);

  server.registerResource("idea", new ResourceTemplate("wasl://idea/{ideaId}", { list: undefined }), { title: "فكرة في وصل", description: "Full details of an idea by id.", mimeType: "application/json" },
    async (uri, { ideaId }) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await fullIdea(ctx, String(ideaId)), null, 2) }] }));

  server.registerPrompt("weekly_digest", { title: "ملخص أسبوعي", description: "Weekly summary for the team manager." }, () => ({
    messages: [{ role: "user", content: { type: "text", text: "اكتب ملخصاً أسبوعياً لمدير التواصل الداخلي من نظام وصل: استخدم wasl_overview ثم list_ideas للأعمال المتأخرة وما ينتظر الاعتماد وما سُلّم هذا الأسبوع. رتّبه في نقاط قصيرة: الإنجاز، والمتأخر ومن المسؤول عنه، والقرارات المطلوبة من المدير." } }],
  }));

  server.registerPrompt("approval_brief", { title: "ملف اعتماد فكرة", description: "Prepare an approval brief for one idea.", argsSchema: { ideaId: z.string() } }, ({ ideaId }) => ({
    messages: [{ role: "user", content: { type: "text", text: `اقرأ الفكرة ${ideaId} عبر get_idea، ثم لخّص للمدير: الهدف، والجمهور، والقنوات، والموعد، وعروض الأسعار إن وجدت، والملاحظات السابقة. اختم بتوصية (اعتماد، تعديل، رفض) مع السبب، ولا تنفذ القرار قبل موافقتي.` } }],
  }));
  return server;
}

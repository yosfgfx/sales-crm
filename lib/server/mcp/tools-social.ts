import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SocialMessage } from "@/data/social";
import { createSocialMessage, listSocialMessages, mutateSocialMessage } from "../social";
import { internal, jsonRequest, tool, type McpContext } from "./context";

const scope = z.enum(["team", "idea", "company", "category", "workspace"]).describe("team = team chat; idea/company/category = discussion of that item (scopeId is its id); workspace = board discussion");

const compact = (message: SocialMessage, origin: string) => ({
  id: message.id, author: message.authorName, authorId: message.authorId, at: message.createdAt, text: message.text, mentions: message.mentions,
  parentId: message.parentId, replies: message.replyCount, pinned: Boolean(message.pinnedAt), deleted: Boolean(message.deletedAt),
  reactions: message.reactions.map((reaction) => `${reaction.emoji} ${reaction.count}`), voice: message.voice ? { seconds: message.voice.durationSeconds, url: message.voice.url.startsWith("/") ? `${origin}${message.voice.url}` : message.voice.url } : null,
});

export function registerSocialTools(server: McpServer, ctx: McpContext) {
  const read = { readOnlyHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  server.registerTool("read_discussion", {
    title: "قراءة المحادثة والنقاشات", description: "Read the team chat or the discussion of an idea, company, category or the board (newest first). Pass parentId to read one reply thread, query to search, before (cursor) for older pages.",
    inputSchema: { scope: scope.default("team"), scopeId: z.string().optional(), parentId: z.string().optional(), query: z.string().max(200).optional(), before: z.string().optional() }, annotations: read,
  }, tool(ctx, "read_discussion", async (args: { scope: string; scopeId?: string; parentId?: string; query?: string; before?: string }) => {
    const params = new URLSearchParams({ scope: args.scope, scopeId: args.scopeId || "main" });
    if (args.parentId) params.set("parentId", args.parentId);
    if (args.query) params.set("q", args.query);
    if (args.before) params.set("before", args.before);
    const page = await listSocialMessages(internal(ctx, `/api/social?${params}`));
    return { messages: page.messages.map((message) => compact(message, ctx.origin)), pinned: page.pinned.map((message) => compact(message, ctx.origin)), nextCursor: page.nextCursor, more: page.more };
  }));

  server.registerTool("post_message", {
    title: "إرسال رسالة أو تعليق", description: "Post to the team chat or to an item's discussion, optionally as a reply (parentId) and mentioning members (mentionIds from list_team). Messages are visible to the team; write in Arabic.",
    inputSchema: { scope: scope.default("team"), scopeId: z.string().optional(), text: z.string().min(1).max(4000), parentId: z.string().optional(), mentionIds: z.array(z.string()).max(30).optional() }, annotations: write,
  }, tool(ctx, "post_message", async (args: { scope: string; scopeId?: string; text: string; parentId?: string; mentionIds?: string[] }) => {
    const result = await createSocialMessage(jsonRequest(ctx, "/api/social", { scope: args.scope, scopeId: args.scopeId || "main", text: args.text, parentId: args.parentId, mentionIds: args.mentionIds, clientNonce: crypto.randomUUID() })) as { message?: SocialMessage };
    return result.message ? compact(result.message, ctx.origin) : result;
  }));

  server.registerTool("react_to_message", { title: "تفاعل مع رسالة", description: "Toggle a reaction on a message: 👍 ❤️ 🎉 👏 🔥 ✅ 💡 😊 🙏 👀", inputSchema: { messageId: z.string(), emoji: z.enum(["👍", "❤️", "🎉", "👏", "🔥", "✅", "💡", "😊", "🙏", "👀"]) }, annotations: write },
    tool(ctx, "react_to_message", async ({ messageId, emoji }: { messageId: string; emoji: string }) => mutateSocialMessage(jsonRequest(ctx, `/api/social/${messageId}`, { operation: "reaction", emoji }, "PATCH"), messageId)));

  server.registerTool("pin_message", { title: "تثبيت رسالة", description: "Administrator: pin or unpin a top-level message in its chat or discussion.", inputSchema: { messageId: z.string(), pinned: z.boolean() }, annotations: write },
    tool(ctx, "pin_message", async ({ messageId, pinned }: { messageId: string; pinned: boolean }) => mutateSocialMessage(jsonRequest(ctx, `/api/social/${messageId}`, { operation: "pin", pinned }, "PATCH"), messageId)));

  server.registerTool("delete_message", { title: "حذف رسالة", description: "Delete a message (your own, or any message as an administrator). Ask the user first.", inputSchema: { messageId: z.string() }, annotations: { ...write, destructiveHint: true } },
    tool(ctx, "delete_message", async ({ messageId }: { messageId: string }) => mutateSocialMessage(internal(ctx, `/api/social/${messageId}`, { method: "DELETE" }), messageId)));
}

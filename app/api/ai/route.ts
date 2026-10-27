import { isAdministrator, requireUser } from "@/lib/server/auth";
import { aiStatus, recentUsage } from "@/lib/server/ai";
import { database } from "@/lib/server/db";
import { apiError, assertSameOrigin, MediaServerError, readJson, responseHeaders } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = database();
    const user = await requireUser(request, db);
    const status = await aiStatus(db);
    if (!isAdministrator(user)) return Response.json({ available: status.available }, { headers: responseHeaders });
    return Response.json({ ...status, usage: await recentUsage(db) }, { headers: responseHeaders });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const db = database();
    const user = await requireUser(request, db);
    if (!isAdministrator(user)) throw new MediaServerError("إعدادات الذكاء الاصطناعي لمدير النظام.", 403, "FORBIDDEN");
    const body = (await readJson(request, 2048)) as { enabled?: unknown; budgetUsd?: unknown } | null;
    if (typeof body?.enabled === "boolean") await db.query("update wasl.settings set ai_enabled = $1 where id", [body.enabled]);
    if (body?.budgetUsd !== undefined) {
      const budget = Number(body.budgetUsd);
      if (!Number.isFinite(budget) || budget < 0 || budget > 10000) throw new MediaServerError("أدخل ميزانية شهرية صالحة بالدولار.", 422, "INVALID_INPUT");
      await db.query("update wasl.settings set ai_budget_usd = $1 where id", [budget]);
    }
    return Response.json({ ...(await aiStatus(db)), usage: await recentUsage(db) }, { headers: responseHeaders });
  } catch (error) {
    return apiError(error);
  }
}

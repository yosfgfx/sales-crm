import { requireUser } from "@/lib/server/auth";
import { apiError, MediaServerError, responseHeaders } from "@/lib/server/http";
import { loadNotifications, NOTIFICATION_PAGE } from "@/lib/server/repository";
import { database } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = database();
    const user = await requireUser(request, db);
    const params = new URL(request.url).searchParams;
    const before = params.get("before") || "";
    const beforeId = params.get("beforeId") || "";
    if (Number.isNaN(Date.parse(before)) || !/^[A-Za-z0-9_-]{1,100}$/.test(beforeId)) throw new MediaServerError("حدد آخر إشعار معروض.");
    const rows = await loadNotifications(db, user.id, { before: { createdAt: new Date(before).toISOString(), id: beforeId } });
    return Response.json({ notifications: rows.slice(0, NOTIFICATION_PAGE), more: rows.length > NOTIFICATION_PAGE }, { headers: responseHeaders });
  } catch (error) { return apiError(error); }
}

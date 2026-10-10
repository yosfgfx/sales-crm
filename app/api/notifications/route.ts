import { requireUser } from "@/lib/server/auth";
import { apiError, MediaServerError, responseHeaders } from "@/lib/server/http";
import { loadNotifications, NOTIFICATION_PAGE } from "@/lib/server/repository";
import { database } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = database();
    const user = await requireUser(request, db);
    const before = new URL(request.url).searchParams.get("before") || "";
    if (Number.isNaN(Date.parse(before))) throw new MediaServerError("حدد تاريخ آخر إشعار معروض.");
    const notifications = await loadNotifications(db, user.id, { before: new Date(before).toISOString() });
    return Response.json({ notifications, more: notifications.length === NOTIFICATION_PAGE }, { headers: responseHeaders });
  } catch (error) { return apiError(error); }
}

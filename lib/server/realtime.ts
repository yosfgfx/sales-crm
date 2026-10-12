import { requireUser } from "./auth";
import { database, type Queryable } from "./db";
import { responseHeaders } from "./http";

export async function readChangeCursor(
  q: Queryable = database(),
): Promise<string> {
  return String(
    (
      await q.query<{ version: string | number }>(
        "select version from wasl.change_cursor where id=true",
      )
    ).rows[0]?.version || "0",
  );
}

/** Database-backed invalidation works across Node workers and never sends record data. */
export async function openEventStream(
  request: Request,
  options: { pollMs?: number; heartbeatMs?: number } = {},
) {
  const db = database();
  await requireUser(request, db);
  const first = await readChangeCursor(db);
  const encoder = new TextEncoder();
  const pollMs = options.pollMs || 1000,
    heartbeatMs = options.heartbeatMs || 15_000;
  let timer: ReturnType<typeof setTimeout> | null = null,
    closed = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cursor = first,
    checkedAt = Date.now();
  const openedAt = Date.now();
  function finish() {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener("abort", finish);
    try {
      controller.close();
    } catch {
      /* Browser already cancelled the stream. */
    }
  }
  function emit(text: string) {
    if (!closed) controller.enqueue(encoder.encode(text));
  }
  async function poll() {
    if (closed) return;
    try {
      // Re-check live role, account revision, active status and administrator MFA.
      if (Date.now() - checkedAt >= heartbeatMs) {
        await requireUser(request, db);
        checkedAt = Date.now();
        emit(": heartbeat\n\n");
      }
      const next = await readChangeCursor(db);
      if (next !== cursor) {
        cursor = next;
        emit(
          `id: ${cursor}\nevent: update\ndata: ${JSON.stringify({ cursor })}\n\n`,
        );
      }
      if (Date.now() - openedAt > 25 * 60_000) {
        finish();
        return;
      }
    } catch {
      // The client reconnects through the authenticated route after transient failures.
      finish();
      return;
    }
    if (!closed) {
      timer = setTimeout(poll, pollMs);
      timer.unref?.();
    }
  }
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      controller = stream;
      request.signal.addEventListener("abort", finish, { once: true });
      if (request.signal.aborted) {
        finish();
        return;
      }
      emit(
        `retry: 3000\nid: ${cursor}\nevent: ready\ndata: ${JSON.stringify({ cursor })}\n\n`,
      );
      const last = request.headers.get("last-event-id");
      if (last && last !== cursor)
        emit(
          `id: ${cursor}\nevent: update\ndata: ${JSON.stringify({ cursor })}\n\n`,
        );
      timer = setTimeout(poll, pollMs);
      timer.unref?.();
    },
    cancel() {
      finish();
    },
  });
  return new Response(body, {
    headers: {
      ...responseHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export class MediaServerError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_REQUEST", public detail?: unknown) { super(message); }
}

export const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };

export function apiError(error: unknown): Response {
  if (error instanceof MediaServerError) return Response.json({ error: error.message, code: error.code, ...(error.detail ? { current: error.detail } : {}) }, { status: error.status, headers: responseHeaders });
  if (error instanceof Error && "status" in error && typeof error.status === "number") return Response.json({ error: error.message, code: "code" in error ? error.code : "INVALID_REQUEST" }, { status: error.status, headers: responseHeaders });
  console.error("Wasl API failed:", error instanceof Error ? `${error.name}: ${"code" in error ? String(error.code) : ""}` : "UnknownError");
  return Response.json({ error: "تعذّر تنفيذ الطلب. حاول مجدداً أو تواصل مع مسؤول النظام.", code: "SERVER_ERROR" }, { status: 500, headers: responseHeaders });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let expected = new URL(request.url).origin;
  if (process.env.MEDIA_APP_ORIGIN) {
    try { expected = new URL(process.env.MEDIA_APP_ORIGIN).origin; } catch { throw new MediaServerError("عنوان النظام في إعدادات الخادم غير صالح. راجع مسؤول النظام.", 503, "ORIGIN_CONFIGURATION"); }
  } else {
    const host = request.headers.get("host");
    if (host) {
      if (!/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d{1,5})?$/.test(host)) throw new MediaServerError("عنوان الطلب غير صالح.", 403, "INVALID_ORIGIN");
      try { expected = new URL(`${new URL(request.url).protocol}//${host}`).origin; } catch { throw new MediaServerError("عنوان الطلب غير صالح.", 403, "INVALID_ORIGIN"); }
    }
  }
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") throw new MediaServerError("لا يمكن تنفيذ الطلب من موقع آخر. افتح النظام مباشرةً وحاول مجدداً.", 403, "INVALID_ORIGIN");
}

export async function limitedBody(request: Request, limit: number): Promise<Uint8Array> {
  const advertised = Number(request.headers.get("content-length") || 0);
  if (advertised > limit) throw new MediaServerError("حجم الطلب أكبر من الحد المسموح.", 413, "REQUEST_TOO_LARGE");
  if (!request.body) throw new MediaServerError("الطلب فارغ.");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new MediaServerError("حجم الطلب أكبر من الحد المسموح.", 413, "REQUEST_TOO_LARGE"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

export async function readJson(request: Request, maxBytes = 256 * 1024): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new MediaServerError("يجب إرسال البيانات بصيغة JSON.", 415, "INVALID_CONTENT_TYPE");
  try { return JSON.parse(new TextDecoder().decode(await limitedBody(request, maxBytes))); } catch (error) { if (error instanceof MediaServerError) throw error; throw new MediaServerError("تعذّر قراءة البيانات. أعد تحميل الصفحة وحاول مجدداً."); }
}

export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip") || "local";
  return /^[a-fA-F0-9:.]{1,64}$/.test(candidate) ? candidate : "local";
}

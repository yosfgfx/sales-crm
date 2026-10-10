import { WorkflowError } from "@/lib/media-workflow";

const STATUS_MESSAGES: Record<number, string> = {
  401: "انتهت جلستك. سجّل الدخول مجدداً.",
  403: "ليست لديك صلاحية لهذا الإجراء.",
  404: "لم يُعثر على المطلوب. ربما حُذف.",
  413: "حجم البيانات أكبر من المسموح.",
  429: "طلبات كثيرة متتالية. انتظر قليلاً ثم أعد المحاولة.",
};

export async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(input, { cache: "no-store", ...init }); }
  catch { throw new WorkflowError("تعذّر الاتصال بالنظام. تحقق من الشبكة ثم أعد المحاولة.", "NETWORK_ERROR", 0); }
  let payload: (T & { error?: string; code?: string; current?: unknown }) | null = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || !payload) {
    const message = payload?.error || STATUS_MESSAGES[response.status] || (response.ok ? "تعذّر قراءة استجابة النظام. أعد المحاولة." : "تعذّر الوصول إلى النظام الآن. أعد المحاولة بعد قليل.");
    const error = new WorkflowError(message, payload?.code || (response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED"), response.status);
    if (payload?.current !== undefined) Object.assign(error, { current: payload.current });
    throw error;
  }
  return payload;
}

export const postJson = <T>(input: string, body: unknown, method = "POST") => apiRequest<T>(input, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

import type { SocialContext, SocialMessage, SocialPage } from "@/data/social";

export class SocialRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SocialRequestError";
  }
}
export function unavailableContext(error: unknown): boolean {
  return (
    error instanceof SocialRequestError &&
    ["CONTEXT_ARCHIVED", "CONTEXT_NOT_FOUND"].includes(error.code || "")
  );
}

export async function socialRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  let data: T & { error?: string; code?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "تعذر قراءة استجابة المحادثة. تحقق من الاتصال ثم أعد المحاولة.",
    );
  }
  if (!response.ok)
    throw new SocialRequestError(
      data.error || "تعذر إتمام الإجراء في المحادثة.",
      response.status,
      data.code,
    );
  return data;
}
export function socialQuery(
  context: SocialContext,
  options: { before?: string | null; q?: string; parentId?: string } = {},
) {
  const query = new URLSearchParams({
    scope: context.scope,
    scopeId: context.scopeId,
  });
  if (options.before) query.set("before", options.before);
  if (options.q) query.set("q", options.q);
  if (options.parentId) query.set("parentId", options.parentId);
  return `/api/social?${query}`;
}
export function getSocialPage(
  context: SocialContext,
  options?: { before?: string | null; q?: string; parentId?: string },
) {
  return socialRequest<SocialPage>(socialQuery(context, options));
}
export function getSocialMessage(id: string) {
  return socialRequest<{ message: SocialMessage }>(
    `/api/social/${encodeURIComponent(id)}`,
  );
}
export async function socialAction(
  id: string,
  operation:
    | { operation: "reaction"; emoji: string }
    | { operation: "pin"; pinned: boolean },
) {
  return socialRequest<{ message: SocialMessage }>(
    `/api/social/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation),
    },
  );
}

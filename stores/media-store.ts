"use client";

import { create } from "zustand";
import {
  createInitialMediaData, type Attachment, type Company, type ContentCategory, type Idea,
  type IdeaPatch, type MediaData, type NewIdeaInput, type Quotation, type ScheduleInput,
  type AccountSummary, type AccountsResponse, type AccountMutationResponse, type NewAccountInput, type AccountPatch, type AccountBaseline,
  type SystemSettings, type TeamMember, type VersionedMediaData,
} from "@/data/media";
import { WorkflowError } from "@/lib/media-workflow";

interface SessionResponse { user: TeamMember | null; demo: boolean; configured: boolean; mfa?: { enabled: boolean; required: boolean } | null }
interface OperationResult {
  idea?: Idea; deletedIdeaId?: string; companies?: Company[]; categories?: ContentCategory[]; settings?: SystemSettings;
  notifications: MediaData["notifications"];
}
export interface MediaState {
  data: MediaData; version: number; currentUser: TeamMember | null; loading: boolean; saving: boolean;
  error: string | null; initialized: boolean; demo: boolean; configured: boolean; mfa: { enabled: boolean; required: boolean } | null;
  accounts: AccountSummary[]; accountsLoaded: boolean; lastFailed: (() => Promise<unknown>) | null;
  olderNotifications: boolean;
  loadOlderNotifications: () => Promise<void>;
  retryLast: () => Promise<void>;
  loadIdea: (ideaId: string) => Promise<void>;
  initialize: () => Promise<void>; refresh: () => Promise<void>;
  setCurrentUser: (memberId: string, password?: string, code?: string) => Promise<void>;
  createIdea: (input: NewIdeaInput) => Promise<Idea>;
  patchIdea: (ideaId: string, patch: IdeaPatch, expectedUpdatedAt?: string) => Promise<void>;
  submitIdea: (ideaId: string) => Promise<void>;
  reviewIdea: (ideaId: string, decision: "approved" | "changes" | "rejected", feedback?: string) => Promise<void>;
  withdrawIdea: (ideaId: string) => Promise<void>;
  cancelIdea: (ideaId: string, reason: string) => Promise<void>;
  reopenIdea: (ideaId: string, reason: string) => Promise<void>;
  reassignIdea: (ideaId: string, input: { ownerId?: string; designerId?: string }) => Promise<void>;
  deleteIdea: (ideaId: string, reason?: string) => Promise<void>;
  scheduleIdea: (ideaId: string, input: ScheduleInput, expectedSchedule?: { designerId: string; scheduledAt: string; dueDate: string; priority: string }) => Promise<void>;
  changeDesignStatus: (ideaId: string, status: "designing" | "design_review" | "delivered") => Promise<void>;
  addAttachments: (ideaId: string, files: Attachment[]) => Promise<void>;
  removeAttachment: (ideaId: string, attachmentId: string) => Promise<void>;
  addQuotation: (ideaId: string, quote: Quotation) => Promise<void>;
  removeQuotation: (ideaId: string, quotationId: string) => Promise<void>;
  addComment: (ideaId: string, text: string) => Promise<void>;
  markNotificationsRead: (ids?: string[]) => Promise<void>;
  updateSettings: (patch: Partial<SystemSettings>, expectedSettings?: Partial<SystemSettings>) => Promise<void>;
  addCompany: (name: string) => Promise<Company>;
  addCategory: (name: string) => Promise<ContentCategory>;
  updateCompany: (companyId: string, patch: { name?: string; shortName?: string; active?: boolean }) => Promise<void>;
  updateCategory: (categoryId: string, patch: { name?: string; active?: boolean; targetPerMonth?: number }) => Promise<void>;
  readAccounts: () => Promise<AccountSummary[]>;
  loadAccounts: () => Promise<AccountSummary[]>;
  createAccount: (input: NewAccountInput) => Promise<TeamMember>;
  updateAccount: (memberId: string, patch: AccountPatch, expected?: AccountBaseline) => Promise<void>;
}

function emptyData() { const empty = createInitialMediaData(); empty.ideas = []; empty.notifications = []; return empty; }
let initialization: Promise<void> | null = null;
let refreshPromise: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let queued = 0;

function messageOf(error: unknown): string {
  if (error instanceof WorkflowError) return error.message;
  if (error instanceof TypeError) return "تعذّر الاتصال بالنظام. تحقق من الشبكة ثم أعد المحاولة.";
  return error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : "تعذّر إكمال العملية. أعد المحاولة.";
}
async function responseJson<T>(response: Response): Promise<T> {
  let payload: T & { error?: string; code?: string };
  try { payload = await response.json(); } catch { throw new WorkflowError(response.ok ? "تعذّر قراءة استجابة النظام. أعد المحاولة." : "تعذّر الوصول إلى النظام الآن. أعد المحاولة بعد قليل.", "INVALID_RESPONSE", response.status); }
  if (!response.ok) throw new WorkflowError(payload.error || "تعذّر إكمال العملية. أعد المحاولة.", payload.code || "REQUEST_FAILED", response.status);
  return payload;
}
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  queued += 1; useMediaStore.setState({ saving: true, error: null });
  const result = queue.then(task);
  queue = result.catch(() => undefined).finally(() => { queued -= 1; useMediaStore.setState({ saving: queued > 0 }); });
  return result.catch((error) => {
    const message = messageOf(error);
    useMediaStore.setState({ error: message });
    throw error instanceof WorkflowError ? error : new WorkflowError(message, "REQUEST_FAILED", 0);
  });
}
async function loadState(): Promise<void> {
  const session = await responseJson<SessionResponse>(await fetch("/api/session", { cache: "no-store" }));
  useMediaStore.setState({ currentUser: session.user, demo: false, configured: session.configured, mfa: session.mfa ?? null });
  if (!session.user) { useMediaStore.setState({ data: emptyData(), version: 0, initialized: true, accounts: [], accountsLoaded: false, error: null }); return; }
  const state = await responseJson<VersionedMediaData>(await fetch("/api/media", { cache: "no-store" }));
  const currentUser = state.data.members.find((member) => member.id === session.user?.id && member.active) ?? null;
  const admin = currentUser?.role === "admin" || currentUser?.role === "superadmin";
  useMediaStore.setState({ data: state.data, version: state.version, initialized: true, error: null, currentUser, olderNotifications: state.data.notifications.length >= NOTIFICATION_PAGE, ...(admin ? {} : { accounts: [], accountsLoaded: false }) });
  if (admin && useMediaStore.getState().accountsLoaded) {
    const accountState = await responseJson<AccountsResponse>(await fetch("/api/accounts", { cache: "no-store" }));
    useMediaStore.setState({ accounts: accountState.accounts, accountsLoaded: true });
  }
}
async function loadAccountState(): Promise<AccountSummary[]> {
  if (refreshPromise) await refreshPromise;
  const result = await responseJson<AccountsResponse>(await fetch("/api/accounts", { cache: "no-store" }));
  useMediaStore.setState({ accounts: result.accounts, accountsLoaded: true });
  return result.accounts;
}
function signedOut(message?: string) {
  useMediaStore.setState({ data: emptyData(), version: 0, currentUser: null, accounts: [], accountsLoaded: false, initialized: true, ...(message ? { error: message } : {}) });
}

function requireAccountRevision(data: MediaData, accounts: AccountSummary[], accountsLoaded: boolean, memberId: unknown, expected?: AccountBaseline) {
  if (expected === undefined) return;
  const member = data.members.find((item) => item.id === memberId);
  if (!member || !accountsLoaded || (["name", "title", "role", "active"] as const).some((key) => member[key] !== expected[key]) || accounts.find((item) => item.memberId === memberId)?.username !== expected.username) {
    throw new WorkflowError("تم تحديث هذا الحساب أثناء تعديلك له. احتفظ بتعديلاتك، ثم أعد فتح بيانات الحساب الأحدث وراجعها قبل الحفظ.", "FORM_VERSION_CONFLICT", 409);
  }
}

function mutateAccount<T = void>(operation: Record<string, unknown>, select?: (next: MediaData, previous: MediaData, memberId?: string) => T, expected?: AccountBaseline): Promise<T> {
  return enqueue(async () => {
    if (refreshPromise) await refreshPromise;
    const { data: previous, currentUser, initialized, accounts, accountsLoaded } = useMediaStore.getState();
    if (!initialized || !currentUser) throw new WorkflowError("سجّل الدخول قبل إدارة حسابات الفريق.", "AUTH_REQUIRED", 401);
    requireAccountRevision(previous, accounts, accountsLoaded, operation.memberId, expected);
    try {
      const saved = await responseJson<AccountMutationResponse & { memberId?: string }>(await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) }));
      if (saved.reloginRequired || !saved.data) { signedOut("تم تحديث حسابك. سجّل الدخول ببياناتك الجديدة."); return undefined as T; }
      useMediaStore.setState({ data: saved.data, currentUser: saved.currentUser, accounts: saved.accounts, accountsLoaded: true, error: null });
      return select ? select(saved.data, previous, saved.memberId) : undefined as T;
    } catch (error) {
      if (error instanceof WorkflowError && error.status === 401) signedOut();
      throw error;
    }
  });
}

export const NOTIFICATION_PAGE = 50;

function mergeNotifications(current: MediaData["notifications"], fresh: MediaData["notifications"]) {
  const newest = new Set(fresh.map((item) => item.id));
  const cutoff = fresh.reduce((min, item) => (item.createdAt < min ? item.createdAt : min), fresh[0]?.createdAt || "");
  return [...fresh, ...current.filter((item) => !newest.has(item.id) && item.createdAt < cutoff)];
}

function operate<T = void>(operation: Record<string, unknown>, select?: (result: OperationResult) => T): Promise<T> {
  useMediaStore.setState({ lastFailed: null });
  return enqueue(async () => {
    if (refreshPromise) await refreshPromise;
    const { currentUser, initialized } = useMediaStore.getState();
    if (!initialized || !currentUser) throw new WorkflowError("سجّل الدخول قبل تحديث بيانات الفريق.", "AUTH_REQUIRED", 401);
    try {
      const result = await responseJson<OperationResult>(await fetch("/api/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) }));
      useMediaStore.setState((state: MediaState) => {
        const data = { ...state.data, notifications: mergeNotifications(state.data.notifications, result.notifications) };
        if (result.idea) data.ideas = state.data.ideas.some((idea: Idea) => idea.id === result.idea!.id) ? state.data.ideas.map((idea: Idea) => (idea.id === result.idea!.id ? result.idea! : idea)) : [result.idea, ...state.data.ideas];
        if (result.deletedIdeaId) data.ideas = data.ideas.filter((idea: Idea) => idea.id !== result.deletedIdeaId);
        if (result.companies) data.companies = result.companies;
        if (result.categories) data.categories = result.categories;
        if (result.settings) data.settings = result.settings;
        return { data, error: null };
      });
      return select ? select(result) : undefined as T;
    } catch (error) {
      if (error instanceof WorkflowError && error.status === 401) signedOut();
      else if (!(error instanceof WorkflowError) || error.status === 0 || error.status >= 500) useMediaStore.setState({ lastFailed: (): Promise<unknown> => operate(operation, select) });
      throw error;
    }
  });
}

export const useMediaStore = create<MediaState>(() => ({
  data: emptyData(), version: 0, currentUser: null, loading: true, saving: false, error: null,
  initialized: false, demo: false, configured: true, mfa: null,
  accounts: [], accountsLoaded: false, lastFailed: null, olderNotifications: false,
  loadOlderNotifications: async (): Promise<void> => {
    const { data, currentUser }: MediaState = useMediaStore.getState();
    const own = data.notifications.filter((item) => item.recipientId === currentUser?.id);
    const oldest = own.reduce((min, item) => (item.createdAt < min ? item.createdAt : min), own[0]?.createdAt || new Date().toISOString());
    const result = await responseJson<{ notifications: MediaData["notifications"]; more: boolean }>(await fetch(`/api/notifications?before=${encodeURIComponent(oldest)}`, { cache: "no-store" }));
    const known = new Set(data.ideas.map((idea) => idea.id));
    useMediaStore.setState((state: MediaState) => {
      const ids = new Set(state.data.notifications.map((item) => item.id));
      const older = result.notifications.filter((item) => !ids.has(item.id) && known.has(item.ideaId));
      return { data: { ...state.data, notifications: [...state.data.notifications, ...older] }, olderNotifications: result.more };
    });
  },
  retryLast: async (): Promise<void> => {
    const state: MediaState = useMediaStore.getState();
    const action = state.lastFailed;
    if (!action) return state.refresh();
    useMediaStore.setState({ lastFailed: null });
    await action();
  },
  loadIdea: async (ideaId: string): Promise<void> => {
    const result = await responseJson<{ idea: Idea }>(await fetch(`/api/ideas/${encodeURIComponent(ideaId)}`, { cache: "no-store" }));
    useMediaStore.setState((state: MediaState) => ({ data: { ...state.data, ideas: state.data.ideas.map((idea: Idea) => (idea.id === ideaId ? result.idea : idea)) } }));
  },
  initialize: () => {
    if (useMediaStore.getState().initialized) return Promise.resolve();
    if (!initialization) initialization = (async () => {
      useMediaStore.setState({ loading: true });
      try { await loadState(); } catch (error) { useMediaStore.setState({ error: messageOf(error) }); }
      finally { useMediaStore.setState({ loading: false }); initialization = null; }
    })();
    return initialization;
  },
  refresh: () => {
    if (queued || refreshPromise) return refreshPromise ?? Promise.resolve();
    refreshPromise = (async () => {
      try { await loadState(); } catch (error) { useMediaStore.setState({ error: messageOf(error) }); }
      finally { useMediaStore.setState({ loading: false }); refreshPromise = null; }
    })(); return refreshPromise;
  },
  setCurrentUser: (memberId, password, code) => enqueue(async () => {
    if (refreshPromise) await refreshPromise;
    const session = await responseJson<SessionResponse>(await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: memberId, ...(password ? { password } : {}), ...(code ? { code } : {}) }) }));
    useMediaStore.setState({ currentUser: session.user, demo: false, configured: session.configured });
    await loadState();
  }),
  createIdea: (input) => operate({ type: "createIdea", input }, (result) => result.idea!),
  patchIdea: (ideaId, patch, expectedUpdatedAt) => operate({ type: "patchIdea", ideaId, patch, expectedUpdatedAt }),
  submitIdea: (ideaId) => operate({ type: "submitIdea", ideaId }),
  withdrawIdea: (ideaId) => operate({ type: "withdrawIdea", ideaId }),
  cancelIdea: (ideaId, reason) => operate({ type: "cancelIdea", ideaId, reason }),
  reopenIdea: (ideaId, reason) => operate({ type: "reopenIdea", ideaId, reason }),
  reassignIdea: (ideaId, input) => operate({ type: "reassignIdea", ideaId, ...input }),
  deleteIdea: (ideaId, reason) => operate({ type: "deleteIdea", ideaId, reason }),
  reviewIdea: (ideaId, decision, feedback) => operate({ type: "reviewIdea", ideaId, decision, feedback }),
  scheduleIdea: (ideaId, input, expectedSchedule) => operate({ type: "scheduleIdea", ideaId, input, expectedSchedule }),
  changeDesignStatus: (ideaId, status) => operate({ type: "changeDesignStatus", ideaId, status }),
  addAttachments: (ideaId, files) => operate({ type: "addAttachments", ideaId, attachmentIds: files.map((file) => file.id) }),
  removeAttachment: (ideaId, attachmentId) => operate({ type: "removeAttachment", ideaId, attachmentId }),
  addQuotation: (ideaId, quote) => operate({ type: "addQuotation", ideaId, quote }),
  removeQuotation: (ideaId, quotationId) => operate({ type: "removeQuotation", ideaId, quotationId }),
  addComment: (ideaId, text) => operate({ type: "addComment", ideaId, text }),
  markNotificationsRead: (ids): Promise<void> => {
    const { data, currentUser }: MediaState = useMediaStore.getState();
    const unread = data.notifications.filter((item) => item.recipientId === currentUser?.id && !item.read && (!ids || ids.includes(item.id)));
    if (!unread.length) return Promise.resolve();
    return operate({ type: "markNotificationsRead", ids: unread.map((item) => item.id) });
  },
  updateSettings: (patch, expected) => operate({ type: "updateSettings", patch, expected }),
  addCompany: (name) => operate({ type: "addCompany", name }, (result) => result.companies!.at(-1)!),
  addCategory: (name) => operate({ type: "addCategory", name }, (result) => result.categories!.at(-1)!),
  updateCompany: (companyId, patch) => operate({ type: "updateCompany", companyId, ...patch }),
  updateCategory: (categoryId, patch) => operate({ type: "updateCategory", categoryId, ...patch }),
  readAccounts: () => enqueue(loadAccountState),
  loadAccounts: () => enqueue(loadAccountState),
  createAccount: ({ username, password, email, ...member }) => mutateAccount({ operation: "create", member, username, password, ...(email ? { email } : {}) }, (next, _previous, memberId) => next.members.find((item) => item.id === memberId)!),
  updateAccount: (memberId, { username, password, email, ...patch }, expected) => mutateAccount({ operation: "update", memberId, patch, ...(username !== undefined ? { username } : {}), ...(password !== undefined ? { password } : {}), ...(email !== undefined ? { email } : {}) }, undefined, expected),
}));

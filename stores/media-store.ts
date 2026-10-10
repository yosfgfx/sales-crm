"use client";

import { create } from "zustand";
import {
  createInitialMediaData, type Attachment, type Company, type ContentCategory, type Idea,
  type IdeaPatch, type MediaData, type MemberPatch, type NewMemberInput, type NewIdeaInput, type Quotation, type ScheduleInput,
  type AccountSummary, type AccountsResponse, type AccountMutationResponse, type NewAccountInput, type AccountPatch, type AccountBaseline,
  type SystemSettings, type TeamMember, type VersionedMediaData,
} from "@/data/media";
import {
  addMediaAttachments, addMediaCategory, addMediaComment, addMediaCompany, addMediaQuotation, addMediaMember, updateMediaMember,
  changeMediaDesignStatus, createMediaIdea, markMediaNotificationsRead, patchMediaIdea,
  removeMediaAttachment, removeMediaQuotation, reviewMediaIdea, scheduleMediaIdea,
  submitMediaIdea, updateMediaSettings, WorkflowError,
} from "@/lib/media-workflow";

interface SessionResponse { user: TeamMember | null; demo: boolean; configured: boolean }
export interface MediaState {
  data: MediaData; version: number; currentUser: TeamMember | null; loading: boolean; saving: boolean;
  error: string | null; initialized: boolean; demo: boolean; configured: boolean;
  accounts: AccountSummary[]; accountsLoaded: boolean;
  initialize: () => Promise<void>; refresh: () => Promise<void>;
  setCurrentUser: (memberId: string, password?: string) => Promise<void>;
  createIdea: (input: NewIdeaInput) => Promise<Idea>;
  patchIdea: (ideaId: string, patch: IdeaPatch, expectedUpdatedAt?: string) => Promise<void>;
  submitIdea: (ideaId: string) => Promise<void>;
  reviewIdea: (ideaId: string, decision: "approved" | "changes", feedback?: string) => Promise<void>;
  scheduleIdea: (ideaId: string, input: ScheduleInput, expectedUpdatedAt?: string) => Promise<void>;
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
  addMember: (input: NewMemberInput) => Promise<TeamMember>;
  updateMember: (memberId: string, patch: MemberPatch) => Promise<void>;
  readAccounts: () => Promise<AccountSummary[]>;
  loadAccounts: () => Promise<AccountSummary[]>;
  createAccount: (input: NewAccountInput) => Promise<TeamMember>;
  updateAccount: (memberId: string, patch: AccountPatch, expected?: AccountBaseline) => Promise<void>;
}

const initial = createInitialMediaData();
initial.ideas = []; initial.notifications = [];
let initialization: Promise<void> | null = null;
let refreshPromise: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let queued = 0;

function messageOf(error: unknown): string { return error instanceof Error ? error.message : "تعذر إكمال العملية. أعد المحاولة."; }
async function responseJson<T>(response: Response): Promise<T> {
  let payload: T & { error?: string; code?: string };
  try { payload = await response.json(); } catch { throw new WorkflowError("تعذر قراءة استجابة النظام. تحقق من الاتصال وحاول مرة أخرى.", "INVALID_RESPONSE", response.status); }
  if (!response.ok) throw new WorkflowError(payload.error || "تعذر إكمال العملية. أعد المحاولة.", payload.code || "REQUEST_FAILED", response.status);
  return payload;
}
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  queued += 1; useMediaStore.setState({ saving: true, error: null });
  const result = queue.then(task);
  queue = result.catch(() => undefined).finally(() => { queued -= 1; useMediaStore.setState({ saving: queued > 0 }); });
  return result.catch((error) => { useMediaStore.setState({ error: messageOf(error) }); throw error; });
}
async function loadState(): Promise<void> {
  const session = await responseJson<SessionResponse>(await fetch("/api/session", { cache: "no-store" }));
  useMediaStore.setState({ currentUser: session.user, demo: session.demo, configured: session.configured });
  if (!session.user) {
    const empty = createInitialMediaData(); empty.ideas = []; empty.notifications = [];
    useMediaStore.setState({ data: empty, version: 0, initialized: true, accounts: [], accountsLoaded: false, error: session.configured || session.demo ? null : "لم تُفعّل حسابات الفريق بعد. يُكمل مسؤول النظام إعداد الدخول من إعدادات الخادم." }); return;
  }
  const state = await responseJson<VersionedMediaData>(await fetch("/api/media", { cache: "no-store" }));
  const currentUser = state.data.members.find((member) => member.id === session.user?.id && member.active) ?? null;
  useMediaStore.setState({ data: state.data, version: state.version, initialized: true, error: null, currentUser, ...(currentUser?.role !== "admin" && currentUser?.role !== "superadmin" ? { accounts: [], accountsLoaded: false } : {}) });
  if (useMediaStore.getState().accountsLoaded && (currentUser?.role === "admin" || currentUser?.role === "superadmin")) {
    const accountState = await responseJson<AccountsResponse>(await fetch("/api/accounts", { cache: "no-store" }));
    useMediaStore.setState({ accounts: accountState.accounts, accountsLoaded: accountState.version === state.version });
  }
}

async function loadAccountState(): Promise<AccountSummary[]> {
  if (refreshPromise) await refreshPromise;
  const result = await responseJson<AccountsResponse>(await fetch("/api/accounts", { cache: "no-store" }));
  useMediaStore.setState({ accounts: result.accounts, accountsLoaded: true });
  // Account metadata and shared data must refer to the same revision before an edit.
  if (result.version !== useMediaStore.getState().version) await loadState();
  return useMediaStore.getState().accounts;
}

function requireAccountRevision(data: MediaData, accounts: AccountSummary[], accountsLoaded: boolean, memberId: unknown, expected?: AccountBaseline) {
  if (expected === undefined) return;
  const member = data.members.find((item) => item.id === memberId);
  if (!member || !accountsLoaded || (["name", "title", "role", "active"] as const).some((key) => member[key] !== expected[key]) || accounts.find((item) => item.memberId === memberId)?.username !== expected.username) {
    throw new WorkflowError("تم تحديث هذا الحساب أثناء تعديلك له. احتفظ بتعديلاتك، ثم أعد فتح بيانات الحساب الأحدث وراجعها قبل الحفظ.", "FORM_VERSION_CONFLICT", 409);
  }
}

function mutateAccount<T = void>(operation: Record<string, unknown>, select?: (next: MediaData, previous: MediaData) => T, expected?: AccountBaseline): Promise<T> {
  return enqueue(async () => {
    if (refreshPromise) await refreshPromise;
    const { data: previous, version, currentUser, initialized, accounts, accountsLoaded } = useMediaStore.getState();
    if (!initialized || !currentUser) throw new WorkflowError("سجّل الدخول قبل إدارة حسابات الفريق.", "AUTH_REQUIRED", 401);
    requireAccountRevision(previous, accounts, accountsLoaded, operation.memberId, expected);
    try {
      const saved = await responseJson<AccountMutationResponse>(await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, ...operation }) }));
      const selected = select ? select(saved.data, previous) : undefined as T;
      if (saved.reloginRequired) {
        const empty = createInitialMediaData(); empty.ideas = []; empty.notifications = [];
        useMediaStore.setState({ data: empty, version: 0, currentUser: null, accounts: [], accountsLoaded: false, demo: false, configured: true, initialized: true, error: "تم تحديث حسابك. سجّل الدخول ببياناتك الجديدة." });
      } else {
        useMediaStore.setState({ data: saved.data, version: saved.version, currentUser: saved.currentUser, accounts: saved.accounts, accountsLoaded: true, error: null });
      }
      return selected;
    } catch (error) {
      if (error instanceof WorkflowError && error.status === 409 && error.code === "VERSION_CONFLICT") {
        try { await loadState(); await loadAccountState(); } catch { /* Preserve the actionable revision conflict. */ }
        throw new WorkflowError("تم تحديث حسابات الفريق. عُرضت النسخة الأحدث؛ راجعها ثم أعد تنفيذ الإجراء.", "VERSION_CONFLICT", 409);
      }
      if (error instanceof WorkflowError && error.status === 401) {
        const empty = createInitialMediaData(); empty.ideas = []; empty.notifications = [];
        useMediaStore.setState({ data: empty, version: 0, currentUser: null, accounts: [], accountsLoaded: false });
      }
      throw error;
    }
  });
}

function requireIdeaRevision(data: MediaData, ideaId: string, expectedUpdatedAt?: string) {
  if (expectedUpdatedAt !== undefined && data.ideas.find((idea) => idea.id === ideaId)?.updatedAt !== expectedUpdatedAt) {
    throw new WorkflowError("تم تحديث الفكرة أثناء تعديلك لها. احتفظ بتعديلاتك، ثم أعد فتح النسخة الأحدث وراجعها قبل الحفظ.", "FORM_VERSION_CONFLICT", 409);
  }
}
function requireSettingsRevision(data: MediaData, patch: Partial<SystemSettings>, expected?: Partial<SystemSettings>) {
  if (expected === undefined) return;
  if ((Object.keys(patch) as (keyof SystemSettings)[]).some((key) => !Object.prototype.hasOwnProperty.call(expected, key) || data.settings[key] !== expected[key])) {
    throw new WorkflowError("تم تحديث هذه الإعدادات أثناء تعديلك لها. احتفظ بالقيم التي كتبتها، ثم أعد فتح الإعدادات الأحدث وراجعها قبل الحفظ.", "FORM_VERSION_CONFLICT", 409);
  }
}

type Mutation = (data: MediaData, actor: TeamMember) => MediaData;
function mutate<T = void>(operation: Mutation, select?: (next: MediaData, previous: MediaData) => T): Promise<T> {
  return enqueue(async () => {
    if (refreshPromise) await refreshPromise;
    const { data: previous, version, currentUser, initialized } = useMediaStore.getState();
    if (!initialized || !currentUser) throw new WorkflowError("سجّل الدخول قبل تحديث بيانات الفريق.", "AUTH_REQUIRED", 401);
    const next = operation(previous, currentUser);
    try {
      const saved = await responseJson<VersionedMediaData>(await fetch("/api/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, data: next }) }));
      useMediaStore.setState({ data: saved.data, version: saved.version, error: null, currentUser: saved.data.members.find((member) => member.id === currentUser.id) ?? currentUser });
      return select ? select(saved.data, previous) : undefined as T;
    } catch (error) {
      if (error instanceof WorkflowError && error.status === 409) {
        // Retrieve the shared version, then ask for an explicit retry. Never overwrite a colleague's change.
        try { await loadState(); } catch { /* The original conflict remains the actionable error. */ }
        throw new WorkflowError("حدّث أحد أعضاء الفريق هذه البيانات. عُرضت النسخة الأحدث؛ راجعها ثم أعد تنفيذ الإجراء.", "VERSION_CONFLICT", 409);
      }
      if (error instanceof WorkflowError && error.status === 401) useMediaStore.setState({ currentUser: null });
      throw error;
    }
  });
}

export const useMediaStore = create<MediaState>(() => ({
  data: initial, version: 0, currentUser: null, loading: true, saving: false, error: null,
  initialized: false, demo: false, configured: false,
  accounts: [], accountsLoaded: false,
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
  setCurrentUser: (memberId, password) => enqueue(async () => {
    if (refreshPromise) await refreshPromise;
    const session = await responseJson<SessionResponse>(await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, ...(password ? { password } : {}) }) }));
    useMediaStore.setState({ currentUser: session.user, demo: session.demo, configured: session.configured });
    await loadState();
  }),
  createIdea: (input) => mutate((data, actor) => createMediaIdea(data, actor, input), (next, previous) => next.ideas.find((idea) => !previous.ideas.some((old) => old.id === idea.id))!),
  patchIdea: (ideaId, patch, expectedUpdatedAt) => mutate((data, actor) => { requireIdeaRevision(data, ideaId, expectedUpdatedAt); return patchMediaIdea(data, actor, ideaId, patch); }),
  submitIdea: (ideaId) => mutate((data, actor) => submitMediaIdea(data, actor, ideaId)),
  reviewIdea: (ideaId, decision, feedback) => mutate((data, actor) => reviewMediaIdea(data, actor, ideaId, decision, feedback)),
  scheduleIdea: (ideaId, input, expectedUpdatedAt) => mutate((data, actor) => { requireIdeaRevision(data, ideaId, expectedUpdatedAt); return scheduleMediaIdea(data, actor, ideaId, input); }),
  changeDesignStatus: (ideaId, status) => mutate((data, actor) => changeMediaDesignStatus(data, actor, ideaId, status)),
  addAttachments: (ideaId, files) => mutate((data, actor) => addMediaAttachments(data, actor, ideaId, files)),
  removeAttachment: (ideaId, attachmentId) => mutate((data, actor) => removeMediaAttachment(data, actor, ideaId, attachmentId)),
  addQuotation: (ideaId, quote) => mutate((data, actor) => addMediaQuotation(data, actor, ideaId, quote)),
  removeQuotation: (ideaId, quotationId) => mutate((data, actor) => removeMediaQuotation(data, actor, ideaId, quotationId)),
  addComment: (ideaId, text) => mutate((data, actor) => addMediaComment(data, actor, ideaId, text)),
  markNotificationsRead: (ids) => mutate((data, actor) => markMediaNotificationsRead(data, actor, ids)),
  updateSettings: (patch, expectedSettings) => mutate((data, actor) => { requireSettingsRevision(data, patch, expectedSettings); return updateMediaSettings(data, actor, patch); }),
  addCompany: (name) => mutate((data, actor) => addMediaCompany(data, actor, name), (next) => next.companies.at(-1)!),
  addCategory: (name) => mutate((data, actor) => addMediaCategory(data, actor, name), (next) => next.categories.at(-1)!),
  addMember: (input) => mutate((data, actor) => addMediaMember(data, actor, input), (next) => next.members.at(-1)!),
  updateMember: (memberId, patch) => mutate((data, actor) => updateMediaMember(data, actor, memberId, patch)),
  readAccounts: () => enqueue(loadAccountState),
  loadAccounts: () => enqueue(loadAccountState),
  createAccount: ({ username, password, ...member }) => mutateAccount({ operation: "create", member, username, password }, (next, previous) => next.members.find((member) => !previous.members.some((old) => old.id === member.id))!),
  updateAccount: (memberId, { username, password, ...patch }, expected) => mutateAccount({ operation: "update", memberId, patch, ...(username !== undefined ? { username } : {}), ...(password !== undefined ? { password } : {}) }, undefined, expected),
}));

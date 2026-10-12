"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaData, TeamMember } from "@/data/media";
import type { SocialContext, SocialMessage, SocialPage } from "@/data/social";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Icon, Modal, errorText } from "../ui";
import { getSocialMessage, getSocialPage } from "./api";
import { MessageComposer } from "./composer";
import { MessageList } from "./message-list";
import { contextReadOnlyReason } from "./context-state";

export interface DiscussionPanelProps {
  context: SocialContext;
  data: MediaData;
  currentUser: TeamMember | null;
  title?: string;
  description?: string;
  compact?: boolean;
  initialThreadId?: string;
}
function mergeMessages(messages: SocialMessage[]) {
  return [
    ...new Map(messages.map((message) => [message.id, message])).values(),
  ].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
export function DiscussionPanel({
  context,
  data,
  currentUser,
  title = "محادثة الفريق",
  description,
  compact,
  initialThreadId,
}: DiscussionPanelProps) {
  const [page, setPage] = useState<SocialPage>({
      messages: [],
      nextCursor: null,
      more: false,
      pinned: [],
    }),
    [loading, setLoading] = useState(true),
    [older, setOlder] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [thread, setThread] = useState<SocialMessage | null>(null),
    [connected, setConnected] = useState<boolean | null>(null),
    [notice, setNotice] = useState(""),
    [backendReadOnly, setBackendReadOnly] = useState<string | null>(null),
    [checkingContext, setCheckingContext] = useState(false);
  const generation = useRef(0),
    loadedPages = useRef(1),
    alive = useRef(true),
    lastRefresh = useRef(0),
    openedThread = useRef<string | null>(null),
    scroller = useRef<HTMLDivElement | null>(null),
    followLatest = useRef(true);
  const { scope, scopeId } = context;
  const readOnlyReason =
    contextReadOnlyReason(context, data) || backendReadOnly;
  const refresh = useCallback(async () => {
    const requestId = ++generation.current;
    try {
      let next = await getSocialPage({ scope, scopeId }, { q: query });
      for (
        let index = 1;
        index < loadedPages.current && next.more && next.nextCursor;
        index++
      ) {
        const previous = await getSocialPage(
          { scope, scopeId },
          { q: query, before: next.nextCursor },
        );
        next = {
          ...previous,
          messages: mergeMessages([...previous.messages, ...next.messages]),
          pinned: next.pinned,
        };
      }
      if (!alive.current || requestId !== generation.current) return;
      setPage(next);
      setError("");
      setLoading(false);
      lastRefresh.current = Date.now();
      setThread((selected) =>
        selected
          ? next.messages.find((message) => message.id === selected.id) ||
            next.pinned.find((message) => message.id === selected.id) ||
            selected
          : null,
      );
    } catch (err) {
      if (alive.current && requestId === generation.current) {
        setError(errorText(err));
        setLoading(false);
      }
    }
  }, [scope, scopeId, query]);
  const checkContext = async () => {
    setCheckingContext(true);
    try {
      const previous = useMediaStore.getState();
      if (previous.saving) {
        setError("انتظر اكتمال الحفظ ثم حدّث حالة النقاش.");
        return;
      }
      await useMediaStore.getState().refresh();
      const latest = useMediaStore.getState();
      if (latest.error) {
        setError(latest.error);
        return;
      }
      if (latest.data === previous.data) {
        setError(
          "لم يكتمل تحديث حالة النقاش بعد. أعد المحاولة عند اكتمال الحفظ.",
        );
        return;
      }
      setBackendReadOnly(contextReadOnlyReason(context, latest.data));
      await refresh();
    } finally {
      setCheckingContext(false);
    }
  };
  useEffect(() => {
    if (!initialThreadId || openedThread.current === initialThreadId) return;
    let active = true;
    const start = setTimeout(() => {
      void (async () => {
        try {
          const requested = (await getSocialMessage(initialThreadId)).message;
          const target = requested.parentId
            ? (await getSocialMessage(requested.parentId)).message
            : requested;
          if (active && target.scope === scope && target.scopeId === scopeId) {
            openedThread.current = initialThreadId;
            setThread(target);
          }
        } catch (err) {
          if (active) setError(errorText(err));
        }
      })();
    }, 0);
    return () => {
      active = false;
      clearTimeout(start);
    };
  }, [initialThreadId, scope, scopeId]);
  useEffect(() => {
    if (followLatest.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [page.messages]);
  useEffect(() => {
    const timer = setTimeout(() => {
      loadedPages.current = 1;
      if (search.trim() !== query) setLoading(true);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    alive.current = true;
    const initial = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(initial);
      alive.current = false;
      generation.current += 1;
    };
  }, [refresh]);
  useEffect(() => {
    const realtime = (event: Event) => {
      const detail = (event as CustomEvent<{ connected?: boolean }>).detail;
      if (typeof detail?.connected === "boolean")
        setConnected(detail.connected);
      if (!document.hidden) void refresh();
    };
    const connection = (event: Event) => {
      const detail = (event as CustomEvent<{ connected?: boolean }>).detail;
      if (typeof detail?.connected === "boolean")
        setConnected(detail.connected);
    };
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("wasl:realtime", realtime);
    window.addEventListener("wasl:connection", connection);
    window.addEventListener("focus", focus);
    const timer = setInterval(() => {
      if (!document.hidden && Date.now() - lastRefresh.current >= 25000)
        void refresh();
    }, 30000);
    return () => {
      window.removeEventListener("wasl:realtime", realtime);
      window.removeEventListener("wasl:connection", connection);
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
  }, [refresh]);
  const loadOlder = async () => {
    if (!page.nextCursor || older) return;
    setOlder(true);
    followLatest.current = false;
    const previousHeight = scroller.current?.scrollHeight || 0,
      previousTop = scroller.current?.scrollTop || 0;
    const requestId = generation.current;
    try {
      const previous = await getSocialPage(
        { scope, scopeId },
        { q: query, before: page.nextCursor },
      );
      if (alive.current && requestId === generation.current) {
        loadedPages.current += 1;
        setPage((current) => ({
          ...current,
          messages: mergeMessages([...previous.messages, ...current.messages]),
          nextCursor: previous.nextCursor,
          more: previous.more,
        }));
        requestAnimationFrame(() => {
          if (scroller.current)
            scroller.current.scrollTop =
              previousTop + scroller.current.scrollHeight - previousHeight;
        });
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      if (alive.current) setOlder(false);
    }
  };
  const changed = (message: SocialMessage) => {
    setPage((current) => ({
      ...current,
      messages: current.messages.map((item) =>
        item.id === message.id ? message : item,
      ),
      pinned:
        message.pinnedAt && !message.deletedAt
          ? mergeMessages([
              ...current.pinned.filter((item) => item.id !== message.id),
              message,
            ])
          : current.pinned.filter((item) => item.id !== message.id),
    }));
    if (thread?.id === message.id) setThread(message);
  };
  const sent = (message: SocialMessage) => {
    setNotice("أُرسلت رسالتك.");
    if (!query)
      setPage((current) => ({
        ...current,
        messages: mergeMessages([...current.messages, message]),
      }));
    void refresh();
  };
  if (!currentUser)
    return (
      <p className="text-sm text-[var(--soft)]">
        سجّل الدخول للمشاركة في المحادثة.
      </p>
    );
  return (
    <section
      dir="rtl"
      className={`min-w-0 space-y-4 ${compact ? "" : "media-card p-4 sm:p-6"}`}
      aria-label={title}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 !text-lg">
            <Icon name="chat" className="size-5 text-[var(--primary)]" />
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-[var(--soft)]">{description}</p>
          )}
        </div>
        <span className="flex items-center gap-2 text-xs text-[var(--soft)]">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${connected === true ? "bg-[var(--success)]" : "bg-[var(--soft)]"}`}
          />
          {connected === true
            ? "تحديث مباشر"
            : connected === false
              ? "يعاد الاتصال · تحديث دوري"
              : "تتحدث المحادثة تلقائيًا"}
        </span>
      </header>
      <label className="media-label">
        البحث في المحادثة
        <div className="relative mt-2">
          <input
            type="search"
            maxLength={200}
            className="media-input !pe-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث عن رسالة أو زميل…"
          />
          <Icon
            name="search"
            className="pointer-events-none absolute end-3 top-3 size-4 text-[var(--soft)]"
          />
        </div>
      </label>
      {page.pinned.length > 0 && !query && (
        <details className="rounded-xl bg-[var(--accent)] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--primary)]">
            الرسائل المثبّتة · {page.pinned.length.toLocaleString("ar-SA")}
          </summary>
          <div className="mt-3">
            <MessageList
              compact
              messages={page.pinned}
              currentUser={currentUser}
              members={data.members}
              onChange={changed}
              onReply={setThread}
            />
          </div>
        </details>
      )}
      <p role="status" className="sr-only">
        {notice}
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-[#fff0f1] p-3 text-sm text-[var(--danger)]"
        >
          {error}
          <ActionButton
            className="ms-2 !px-3 !text-xs"
            onClick={() => void refresh()}
          >
            إعادة المحاولة
          </ActionButton>
        </div>
      )}
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          followLatest.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
        }}
        className="max-h-[60dvh] min-h-48 space-y-3 overflow-y-auto overscroll-contain rounded-2xl bg-[var(--background)] p-3 sm:p-4"
      >
        {page.more && (
          <div className="text-center">
            <ActionButton disabled={older} onClick={() => void loadOlder()}>
              {older ? "جارٍ تحميل الرسائل…" : "تحميل رسائل أقدم"}
            </ActionButton>
          </div>
        )}
        {loading ? (
          <p
            role="status"
            className="py-10 text-center text-sm text-[var(--soft)]"
          >
            جارٍ تحميل المحادثة…
          </p>
        ) : !page.messages.length ? (
          <div className="py-10 text-center">
            <Icon
              name="chat"
              className="mx-auto mb-3 size-8 text-[var(--soft)]"
            />
            <p className="font-semibold">
              {query ? "لا توجد رسائل تطابق البحث" : "ابدأ الحديث مع فريقك"}
            </p>
            <p className="mt-1 text-sm text-[var(--soft)]">
              {query
                ? "جرّب كلمات أقل أو اسم الزميل."
                : "شارك فكرة سريعة، اسأل زميلًا، أو احتفل بإنجاز جديد."}
            </p>
          </div>
        ) : (
          <MessageList
            compact={compact}
            messages={page.messages}
            currentUser={currentUser}
            members={data.members}
            onChange={changed}
            onReply={setThread}
          />
        )}
      </div>
      {readOnlyReason ? (
        <div
          role="status"
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4"
        >
          <p className="text-sm text-[var(--soft)]">{readOnlyReason}</p>
          {backendReadOnly && (
            <ActionButton
              disabled={checkingContext}
              className="mt-3 !px-3 !text-xs"
              onClick={() => void checkContext()}
            >
              {checkingContext ? "جارٍ التحديث…" : "تحديث حالة النقاش"}
            </ActionButton>
          )}
        </div>
      ) : (
        <MessageComposer
          context={{ scope, scopeId }}
          members={data.members}
          currentUser={currentUser}
          onSent={sent}
          onUnavailable={setBackendReadOnly}
        />
      )}
      <Modal
        open={!!thread}
        onClose={() => setThread(null)}
        wide
        title="الردود"
        description="تظل الردود مرتبطة بالرسالة الأصلية لسهولة الرجوع إليها."
      >
        {thread && (
          <ThreadPanel
            key={thread.id}
            context={{ scope, scopeId }}
            root={thread}
            data={data}
            currentUser={currentUser}
            onRootChange={changed}
            onClose={() => setThread(null)}
            readOnlyReason={readOnlyReason}
            onUnavailable={setBackendReadOnly}
          />
        )}
      </Modal>
    </section>
  );
}

function ThreadPanel({
  context,
  root,
  data,
  currentUser,
  onRootChange,
  onClose,
  readOnlyReason,
  onUnavailable,
}: {
  context: SocialContext;
  root: SocialMessage;
  data: MediaData;
  currentUser: TeamMember;
  onRootChange: (message: SocialMessage) => void;
  onClose: () => void;
  readOnlyReason: string | null;
  onUnavailable: (message: string) => void;
}) {
  const [page, setPage] = useState<SocialPage>({
      messages: [],
      nextCursor: null,
      more: false,
      pinned: [],
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [older, setOlder] = useState(false);
  const alive = useRef(true),
    request = useRef(0),
    loadedPages = useRef(1);
  const { scope, scopeId } = context;
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      let next = await getSocialPage({ scope, scopeId }, { parentId: root.id });
      for (
        let index = 1;
        index < loadedPages.current && next.more && next.nextCursor;
        index++
      ) {
        const previous = await getSocialPage(
          { scope, scopeId },
          { parentId: root.id, before: next.nextCursor },
        );
        next = {
          ...previous,
          messages: mergeMessages([...previous.messages, ...next.messages]),
        };
      }
      if (alive.current && id === request.current) {
        setPage(next);
        setLoading(false);
        setError("");
      }
    } catch (err) {
      if (alive.current && id === request.current) {
        setError(errorText(err));
        setLoading(false);
      }
    }
  }, [scope, scopeId, root.id]);
  useEffect(() => {
    alive.current = true;
    const initial = setTimeout(() => void refresh(), 0);
    const changed = () => void refresh();
    window.addEventListener("wasl:realtime", changed);
    const timer = setInterval(changed, 30000);
    return () => {
      clearTimeout(initial);
      alive.current = false;
      request.current += 1;
      window.removeEventListener("wasl:realtime", changed);
      clearInterval(timer);
    };
  }, [refresh]);
  const loadOlder = async () => {
    if (!page.nextCursor || older) return;
    setOlder(true);
    const generation = request.current;
    try {
      const next = await getSocialPage(context, {
        parentId: root.id,
        before: page.nextCursor,
      });
      if (alive.current && generation === request.current) {
        loadedPages.current += 1;
        setPage((current) => ({
          ...next,
          messages: mergeMessages([...next.messages, ...current.messages]),
        }));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      if (alive.current) setOlder(false);
    }
  };
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <MessageList
        compact
        messages={[root]}
        members={data.members}
        currentUser={currentUser}
        onChange={onRootChange}
      />
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-[var(--soft)]">
          جارٍ تحميل الردود…
        </p>
      ) : (
        <>
          <h3 className="!text-base">الردود</h3>
          {page.more && (
            <ActionButton disabled={older} onClick={() => void loadOlder()}>
              تحميل ردود أقدم
            </ActionButton>
          )}
          {!page.messages.length ? (
            <p className="text-sm text-[var(--soft)]">لا توجد ردود بعد.</p>
          ) : (
            <MessageList
              compact
              messages={page.messages}
              members={data.members}
              currentUser={currentUser}
              onChange={(message) =>
                setPage((current) => ({
                  ...current,
                  messages: current.messages.map((item) =>
                    item.id === message.id ? message : item,
                  ),
                }))
              }
            />
          )}
        </>
      )}
      {readOnlyReason ? (
        <p
          role="status"
          className="rounded-xl bg-[var(--background)] p-4 text-sm text-[var(--soft)]"
        >
          {readOnlyReason}
        </p>
      ) : (
        !root.deletedAt && (
          <MessageComposer
            context={context}
            parentId={root.id}
            members={data.members}
            currentUser={currentUser}
            onCancelReply={onClose}
            onUnavailable={onUnavailable}
            onSent={(message) => {
              setPage((current) => ({
                ...current,
                messages: mergeMessages([...current.messages, message]),
              }));
              onRootChange({ ...root, replyCount: root.replyCount + 1 });
              void refresh();
            }}
          />
        )
      )}
    </div>
  );
}

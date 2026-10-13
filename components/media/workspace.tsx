"use client";

import { useEffect, useMemo, useState } from "react";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Icon, Modal, formatDate, today, errorText } from "./ui";
import IdeaEditor from "./idea-editor";
import IdeaDetail from "./idea-detail";
import Administration from "./administration";
import Approvals from "./approvals";
import Archive from "./archive";
import { Reports } from "./reports";
import { isAdministrator } from "@/lib/media-workflow";
import {
  descriptions,
  matches,
  navigation,
  type View,
} from "./workspace/shared";
import { LoginScreen } from "./workspace/login-screen";
import { Sidebar } from "./workspace/sidebar";
import { WorkspaceHeader } from "./workspace/header";
import { AccountDialog, NotificationsDialog } from "./workspace/dialogs";
import { Overview } from "./workspace/overview";
import { WorkBoard } from "./workspace/work-board";
import { IdeaList } from "./workspace/idea-list";
import { Calendar } from "./workspace/calendar-view";
import { ContextDiscussion, TeamChat } from "./social";
import TeamRealtime from "./team-realtime";
import { getSocialMessage } from "./social/api";
import { useTeamPresence } from "@/stores/team-presence";
import type { MediaNotification } from "@/data/media";
import DiscussionShortcuts from "./discussion-shortcuts";
import EngagementSync from "./engagement/engagement-sync";
import { Today } from "./engagement/today";
import { Welcome } from "./engagement/welcome";
import { Meetings } from "./engagement/meetings";
import { HonorBoard } from "./engagement/honor";
import { People, canSeeProfiles } from "./engagement/people";

export type { View };
export { IdeaCard } from "./workspace/idea-card";
export { IdeaList };

export default function MediaWorkspace() {
  const store = useMediaStore();
  const { data: storedData, currentUser, loading, saving, error, demo } = store;
  const data = useMemo(
    () => ({
      ...storedData,
      ideas: storedData.ideas.filter((idea) => !idea.deletedAt),
    }),
    [storedData],
  );
  const connected = useTeamPresence((state) => state.connected);
  const [view, setView] = useState<View>("today");
  const [meetingId, setMeetingId] = useState<string | undefined>();
  const [personId, setPersonId] = useState<string | undefined>();
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [chatThread, setChatThread] = useState<string>();
  const [ideaThread, setIdeaThread] = useState<string>();
  const [discussion, setDiscussion] = useState<{
    kind: "company" | "category" | "workspace";
    id: string;
    title: string;
    threadId?: string;
  } | null>(null);
  const [editor, setEditor] = useState<boolean | string>(false);
  const [notifications, setNotifications] = useState(false);
  const [account, setAccount] = useState(false);
  const [notice, setNotice] = useState("");
  const [loginMember, setLoginMember] = useState("");
  const [adminTab, setAdminTab] = useState<string | undefined>();
  const [driveNotice, setDriveNotice] = useState<string | undefined>();
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const initialize = store.initialize;
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.size) return;
    const drive = params.get("drive");
    const message =
      drive === "connected"
        ? "رُبط Google Drive بنجاح. اختر مجلد الأرشيف الآن."
        : drive === "error"
          ? params.get("code") === "OAUTH_DENIED"
            ? "أُلغي ربط Google Drive من شاشة Google."
            : "تعذّر إكمال ربط Google Drive. أعد المحاولة من هنا."
          : undefined;
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      if (params.get("view") === "admin") {
        setView("admin");
        setAdminTab(params.get("tab") || undefined);
      }
      if (message) setDriveNotice(message);
    });
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !useMediaStore.getState().saving)
        void useMediaStore.getState().refresh();
    };
    const timer = setInterval(refresh, 20000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const unread = data.notifications.filter(
    (n) => n.recipientId === currentUser?.id && !n.read,
  );
  const pending = data.ideas.filter((i) => i.status === "review").length;
  const canCreate =
    currentUser?.role === "content" || isAdministrator(currentUser);
  const containsDemoArtifacts = data.ideas.some((idea) =>
    idea.attachments.some((file) => file.id.startsWith("demo-")),
  );
  const currentIdea = storedData.ideas.find((i) => i.id === selected);
  const searchResults = useMemo(
    () =>
      query.trim() ? data.ideas.filter((i) => matches(i, query, data)) : [],
    [data, query],
  );
  const go = (next: View) => {
    if (next !== "meetings") setMeetingId(undefined);
    if (next !== "people") setPersonId(undefined);
    setView(next);
    setQuery("");
    setMobileNav(false);
  };
  const openIdea = (id: string) => {
    setIdeaThread(undefined);
    setDetailTab("overview");
    setSelected(id);
  };
  const navigateNotice = async (notice: MediaNotification) => {
    if (notice.entityType === "chat" && notice.entityId) {
      try {
        const { message } = await getSocialMessage(notice.entityId);
        if (message.scope === "meeting") {
          setSelected(null);
          go("meetings");
          setMeetingId(message.scopeId);
        } else if (message.scope === "idea") {
          await store.loadIdea(message.scopeId);
          setIdeaThread(message.id);
          setDetailTab("discussion");
          setSelected(message.scopeId);
        } else if (message.scope === "team") {
          setSelected(null);
          setChatThread(message.id);
          go("chat");
        } else {
          const title =
            message.scope === "company"
              ? storedData.companies.find((item) => item.id === message.scopeId)
                  ?.name
              : message.scope === "category"
                ? storedData.categories.find(
                    (item) => item.id === message.scopeId,
                  )?.name
                : "نقاش لوحة العمل";
          setSelected(null);
          setDiscussion({
            kind: message.scope,
            id: message.scopeId,
            title: title || "نقاش الفريق",
            threadId: message.id,
          });
        }
      } catch (cause) {
        setNotice(errorText(cause));
      }
      return;
    }
    if (notice.entityType === "meeting" && notice.entityId) {
      setSelected(null);
      go("meetings");
      setMeetingId(notice.entityId);
      return;
    }
    if (notice.entityType === "honor") {
      setSelected(null);
      go("honor");
      return;
    }
    if (
      ["company", "category", "workspace"].includes(notice.entityType || "")
    ) {
      const kind = notice.entityType as "company" | "category" | "workspace";
      const entityId = notice.entityId || "main";
      const title =
        kind === "company"
          ? storedData.companies.find((item) => item.id === entityId)?.name
          : kind === "category"
            ? storedData.categories.find((item) => item.id === entityId)?.name
            : "نقاش لوحة العمل";
      setDiscussion({ kind, id: entityId, title: title || "نقاش الفريق" });
      return;
    }
    if (
      notice.ideaId &&
      storedData.ideas.some((idea) => idea.id === notice.ideaId)
    ) {
      setIdeaThread(undefined);
      setDetailTab(notice.type === "comment" ? "activity" : "overview");
      setSelected(notice.ideaId);
      return;
    }
    if (
      isAdministrator(currentUser) &&
      ["member", "settings"].includes(notice.entityType || "")
    ) {
      setAdminTab(notice.entityType === "member" ? "team" : "identity");
      go("admin");
      return;
    }
    go("today");
  };
  const run = async (action: () => Promise<unknown>, message?: string) => {
    try {
      await action();
      if (message) setNotice(message);
    } catch (e) {
      setNotice(errorText(e));
    }
  };

  if (loading && !store.initialized)
    return (
      <div
        dir="rtl"
        className="media-app flex min-h-dvh items-center justify-center"
      >
        <div className="flex items-center gap-3" role="status">
          <Icon name="spark" className="size-8 text-[var(--primary)]" />
          جارٍ تجهيز مساحة العمل…
        </div>
      </div>
    );
  if (!currentUser)
    return (
      <LoginScreen
        store={store}
        data={data}
        demo={demo}
        error={error}
        saving={saving}
        loginMember={loginMember}
        setLoginMember={setLoginMember}
        password={password}
        setPassword={setPassword}
        mfaCode={mfaCode}
        setMfaCode={setMfaCode}
        mfaNeeded={mfaNeeded}
        setMfaNeeded={setMfaNeeded}
        notice={notice}
        setNotice={setNotice}
      />
    );

  const sidebar = (
    <Sidebar
      view={view}
      pending={pending}
      currentUser={currentUser}
      go={go}
      setAccount={setAccount}
    />
  );

  return (
    <div dir="rtl" className="media-app flex min-h-dvh bg-[var(--background)]">
      <TeamRealtime currentUser={currentUser} onOpenIdea={openIdea} />
      <EngagementSync memberId={currentUser.id} />
      <Welcome data={data} currentUser={currentUser} onOpenIdea={openIdea} />
      <a
        href="#workspace-content"
        className="sr-only z-[100] rounded-lg bg-white p-3 text-[var(--primary)] focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        انتقل إلى المحتوى
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[250px] shrink-0 flex-col overflow-y-auto bg-[#1d243c] text-white lg:flex">
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1">
        <WorkspaceHeader
          view={view}
          query={query}
          setQuery={setQuery}
          setMobileNav={setMobileNav}
          setNotifications={setNotifications}
          setAccount={setAccount}
          unread={unread}
          currentUser={currentUser}
        />
        <main
          id="workspace-content"
          className="mx-auto max-w-[110em] space-y-6 p-4 pb-12 lg:p-8"
        >
          <div className={`flex flex-wrap items-start gap-4 ${view === "today" && !query ? "justify-end" : "justify-between"}`}>
            {(view !== "today" || query) && (
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--soft)]">
                <span>
                  {formatDate(today(), { weekday: "long", year: "numeric" })}
                </span>
                {(demo || containsDemoArtifacts) && (
                  <span className="media-badge media-badge-warning !py-0.5">
                    {demo ? "بيانات تجريبية" : "توجد نماذج تجريبية"}
                  </span>
                )}
              </div>
              <h1>
                {query
                  ? "نتائج البحث"
                  : view === "overview"
                    ? `مرحبًا ${currentUser.name.split(" ")[0]}، لنصنع أثرًا اليوم`
                    : view === "admin"
                      ? "إدارة النظام"
                      : navigation.find((n) => n.id === view)?.label}
              </h1>
              <p className="mt-2 max-w-[48em] text-[var(--soft)]">
                {query
                  ? `البحث في جميع مراحل العمل والأرشيف عن «${query}»`
                  : descriptions[view]}
              </p>
            </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="flex items-center gap-1.5 text-xs text-[var(--soft)]"
                role="status"
              >
                <span
                  className={`size-1.5 rounded-full ${saving ? "bg-[#d7984c]" : error ? "bg-[var(--danger)]" : "bg-[var(--success)]"}`}
                />
                {saving
                  ? "جارٍ الحفظ…"
                  : error
                    ? "تعذر إتمام الإجراء"
                    : "محفوظ ومحدّث"}
              </span>
              <span
                className={`flex items-center gap-1.5 text-xs ${connected ? "text-[var(--success)]" : "text-[var(--soft)]"}`}
                title={
                  connected
                    ? "تصل تحديثات العمل والرسائل تلقائيًا."
                    : "يعيد النظام الاتصال ويتحقق من التحديثات تلقائيًا."
                }
              >
                <Icon
                  name={connected ? "link" : "refresh"}
                  className="size-3.5"
                />
                {connected ? "متصل لحظيًا" : "تحديث تلقائي"}
              </span>
              {canCreate && (
                <ActionButton primary onClick={() => setEditor(true)}>
                  <Icon name="plus" className="size-4" />
                  فكرة جديدة
                </ActionButton>
              )}
            </div>
          </div>
          {store.mfa?.required && !store.mfa.enabled && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c98a] bg-[#fff6e8] p-4 text-sm text-[#7a4b00]"
            >
              <span>
                فعّل التحقق بخطوتين لحماية حساب الإدارة. أدوات الإدارة متوقفة
                حتى تفعيله.
              </span>
              <ActionButton
                className="!text-xs"
                onClick={() => setAccount(true)}
              >
                تفعيل الآن
              </ActionButton>
            </div>
          )}
          {(error || notice) && (
            <div
              role={error ? "alert" : "status"}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white p-4"
            >
              <span>{notice || error}</span>
              <div className="flex gap-2">
                {error && (
                  <ActionButton
                    onClick={() =>
                      void run(
                        () => store.retryLast(),
                        store.lastFailed ? "أُعيد تنفيذ الإجراء." : undefined,
                      )
                    }
                  >
                    <Icon name="refresh" className="size-4" />
                    إعادة المحاولة
                  </ActionButton>
                )}
                <ActionButton
                  onClick={() => {
                    setNotice("");
                    useMediaStore.setState({ error: null });
                  }}
                  aria-label="إغلاق الرسالة"
                  className="size-8 px-0"
                >
                  <Icon name="close" className="size-4" />
                </ActionButton>
              </div>
            </div>
          )}
          {query ? (
            <IdeaList ideas={searchResults} data={data} onOpen={openIdea} />
          ) : (
            <>
              {view === "today" && (
                <Today
                  data={data}
                  currentUser={currentUser}
                  onOpenIdea={openIdea}
                  onOpenMeeting={(id) => {
                    go("meetings");
                    setMeetingId(id);
                  }}
                  onOpenHonor={() => go("honor")}
                  onViewIdeas={() => go(currentUser.role === "designer" ? "design" : "ideas")}
                />
              )}
              {view === "meetings" && (
                <Meetings
                  data={data}
                  currentUser={currentUser}
                  selectedId={meetingId}
                  onSelect={setMeetingId}
                  onOpenIdea={openIdea}
                />
              )}
              {view === "honor" && (
                <HonorBoard
                  data={data}
                  currentUser={currentUser}
                  onOpenProfile={
                    canSeeProfiles(currentUser)
                      ? (id) => {
                          go("people");
                          setPersonId(id);
                        }
                      : undefined
                  }
                />
              )}
              {view === "people" && (
                <People
                  data={data}
                  currentUser={currentUser}
                  selectedId={personId}
                  onSelect={setPersonId}
                />
              )}
              {view === "overview" && (
                <>
                  <Overview
                    data={data}
                    currentId={currentUser.id}
                    onOpen={openIdea}
                    onView={go}
                  />
                  <div className="media-card flex flex-wrap items-center justify-between gap-4 p-5">
                    <div>
                      <h2 className="!text-lg">نتواصل، وننجز معًا</h2>
                      <p className="mt-1 text-sm text-[var(--soft)]">
                        ناقش الأولويات على اللوحة، أو شارك تحديثًا ورسالة تقدير
                        مع الفريق.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        onClick={() => {
                          setChatThread(undefined);
                          go("chat");
                        }}
                      >
                        <Icon name="chat" className="size-4" />
                        دردشة الفريق
                      </ActionButton>
                      <ActionButton
                        onClick={() =>
                          setDiscussion({
                            kind: "workspace",
                            id: "main",
                            title: "نقاش لوحة العمل",
                          })
                        }
                      >
                        <Icon name="reply" className="size-4" />
                        تعليقات اللوحة
                      </ActionButton>
                    </div>
                  </div>
                </>
              )}{" "}
              {view === "ideas" && (
                <WorkBoard mode="content" data={data} onOpen={openIdea} />
              )}{" "}
              {view === "approvals" && (
                <Approvals data={data} onOpen={openIdea} onNotice={setNotice} />
              )}{" "}
              {view === "design" && (
                <WorkBoard mode="design" data={data} onOpen={openIdea} />
              )}{" "}
              {view === "calendar" && (
                <Calendar data={data} onOpen={openIdea} />
              )}{" "}
              {view === "archive" && (
                <Archive data={data} onOpenIdea={openIdea} />
              )}{" "}
              {view === "reports" && (
                <Reports data={data} onOpenIdea={openIdea} />
              )}{" "}
              {view === "chat" && (
                <>
                  <DiscussionShortcuts data={data} onOpen={setDiscussion} />
                  <TeamChat
                    data={data}
                    currentUser={currentUser}
                    initialThreadId={chatThread}
                  />
                </>
              )}
              {view === "admin" && isAdministrator(currentUser) && (
                <Administration
                  key={adminTab || "admin"}
                  onOpenIdea={openIdea}
                  onEditIdea={(id) =>
                    void run(async () => {
                      await store.loadIdea(id);
                      setEditor(id);
                      setSelected(null);
                    })
                  }
                  onCreateIdea={() => setEditor(true)}
                  onDiscussion={(target) => setDiscussion(target)}
                  onNotice={setNotice}
                  initialTab={adminTab}
                  driveNotice={driveNotice}
                />
              )}
            </>
          )}
        </main>
      </div>
      <Modal
        open={mobileNav}
        onClose={() => setMobileNav(false)}
        title="التنقل في مساحة العمل"
      >
        <div className="flex min-h-[75dvh] flex-col bg-[#1d243c] text-white">
          {sidebar}
        </div>
      </Modal>
      <NotificationsDialog
        notifications={notifications}
        setNotifications={setNotifications}
        run={run}
        store={store}
        data={data}
        currentUser={currentUser}
        onNavigateNotice={navigateNotice}
      />
      <AccountDialog
        account={account}
        setAccount={setAccount}
        setSelected={setSelected}
        setEditor={setEditor}
        go={go}
        run={run}
        store={store}
        data={data}
        demo={demo}
        currentUser={currentUser}
      />
      <IdeaEditor
        open={!!editor}
        idea={
          typeof editor === "string"
            ? storedData.ideas.find((i) => i.id === editor)
            : undefined
        }
        onClose={() => setEditor(false)}
        onSaved={(id) => {
          setEditor(false);
          setSelected(id);
        }}
      />
      {currentIdea && (
        <IdeaDetail
          key={`${currentIdea.id}:${detailTab}:${ideaThread || ""}`}
          idea={currentIdea}
          initialTab={detailTab}
          initialThreadId={ideaThread}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditor(currentIdea.id);
            setSelected(null);
          }}
        />
      )}
      <Modal
        open={Boolean(discussion)}
        onClose={() => setDiscussion(null)}
        title={discussion?.title || "نقاش الفريق"}
        description="تعليقات الفريق، والردود والرسائل الصوتية مرتبطة بهذا القسم."
        wide
      >
        {discussion && (
          <div className="p-4 sm:p-6">
            <ContextDiscussion
              key={`${discussion.kind}:${discussion.id}`}
              contextType={discussion.kind}
              contextId={discussion.id}
              title={discussion.title}
              data={data}
              currentUser={currentUser}
              initialThreadId={discussion.threadId}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

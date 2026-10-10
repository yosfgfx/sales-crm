"use client";

import { useEffect, useMemo, useState } from "react";
import { useMediaStore } from "@/stores/media-store";
import {
  ActionButton,
  Icon,
  Modal,
  formatDate,
  today,
  errorText,
} from "./ui";
import IdeaEditor from "./idea-editor";
import IdeaDetail from "./idea-detail";
import Administration from "./administration";
import Approvals from "./approvals";
import Archive from "./archive";
import { Reports } from "./reports";
import { isAdministrator } from "@/lib/media-workflow";
import { descriptions, matches, navigation, type View } from "./workspace/shared";
import { LoginScreen } from "./workspace/login-screen";
import { Sidebar } from "./workspace/sidebar";
import { WorkspaceHeader } from "./workspace/header";
import { AccountDialog, NotificationsDialog } from "./workspace/dialogs";
import { Overview } from "./workspace/overview";
import { WorkBoard } from "./workspace/work-board";
import { IdeaList } from "./workspace/idea-list";
import { Calendar } from "./workspace/calendar-view";

export type { View };
export { IdeaCard } from "./workspace/idea-card";
export { IdeaList };

export default function MediaWorkspace() {
  const store = useMediaStore();
  const { data, currentUser, loading, saving, error, demo } = store;
  const [view, setView] = useState<View>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
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
    const message = drive === "connected" ? "رُبط Google Drive بنجاح. اختر مجلد الأرشيف الآن." : drive === "error" ? (params.get("code") === "OAUTH_DENIED" ? "أُلغي ربط Google Drive من شاشة Google." : "تعذّر إكمال ربط Google Drive. أعد المحاولة من هنا.") : undefined;
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      if (params.get("view") === "admin") { setView("admin"); setAdminTab(params.get("tab") || undefined); }
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
  const currentIdea = data.ideas.find((i) => i.id === selected);
  const searchResults = useMemo(
    () =>
      query.trim() ? data.ideas.filter((i) => matches(i, query, data)) : [],
    [data, query],
  );
  const go = (next: View) => {
    setView(next);
    setQuery("");
    setMobileNav(false);
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
          <div className="flex flex-wrap items-start justify-between gap-4">
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
              {canCreate && (
                <ActionButton primary onClick={() => setEditor(true)}>
                  <Icon name="plus" className="size-4" />
                  فكرة جديدة
                </ActionButton>
              )}
            </div>
          </div>
          {store.mfa?.required && !store.mfa.enabled && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c98a] bg-[#fff6e8] p-4 text-sm text-[#7a4b00]">
              <span>فعّل التحقق بخطوتين لحماية حساب الإدارة. أدوات الإدارة متوقفة حتى تفعيله.</span>
              <ActionButton className="!text-xs" onClick={() => setAccount(true)}>تفعيل الآن</ActionButton>
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
                  <ActionButton onClick={() => void run(() => store.retryLast(), store.lastFailed ? "أُعيد تنفيذ الإجراء." : undefined)}>
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
            <IdeaList ideas={searchResults} data={data} onOpen={setSelected} />
          ) : (
            <>
              {view === "overview" && (
                <Overview
                  data={data}
                  currentId={currentUser.id}
                  onOpen={setSelected}
                  onView={go}
                />
              )}{" "}
              {view === "ideas" && (
                <WorkBoard mode="content" data={data} onOpen={setSelected} />
              )}{" "}
              {view === "approvals" && (
                <Approvals
                  data={data}
                  onOpen={setSelected}
                  onNotice={setNotice}
                />
              )}{" "}
              {view === "design" && (
                <WorkBoard mode="design" data={data} onOpen={setSelected} />
              )}{" "}
              {view === "calendar" && (
                <Calendar data={data} onOpen={setSelected} />
              )}{" "}
              {view === "archive" && (
                <Archive data={data} onOpenIdea={setSelected} />
              )}{" "}
              {view === "reports" && (
                <Reports data={data} onOpenIdea={setSelected} />
              )}{" "}
              {view === "admin" && isAdministrator(currentUser) && (
                <Administration onOpenIdea={setSelected} onNotice={setNotice} initialTab={adminTab} driveNotice={driveNotice} />
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
        setSelected={setSelected}
        run={run}
        store={store}
        data={data}
        currentUser={currentUser}
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
            ? data.ideas.find((i) => i.id === editor)
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
          key={currentIdea.id}
          idea={currentIdea}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditor(currentIdea.id);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

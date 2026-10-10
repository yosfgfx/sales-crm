"use client";

import MfaSettings from "./mfa-settings";
import { useEffect, useMemo, useState } from "react";
import { useMediaStore } from "@/stores/media-store";
import {
  memberDisplayLabel,
  STATUS_LABELS,
  WORK_TYPE_LABELS,
  type Idea,
  type MediaData,
} from "@/data/media";
import {
  ActionButton,
  countText,
  Channels,
  EmptyState,
  Icon,
  Modal,
  PriorityBadge,
  StatusBadge,
  formatDate,
  today,
  type IconName,
  errorText,
} from "./ui";
import IdeaEditor from "./idea-editor";
import IdeaDetail from "./idea-detail";
import Administration from "./administration";
import Approvals from "./approvals";
import Archive from "./archive";
import { Reports } from "./reports";
import { CompanyLogo } from "./company-logo";
import { isAdministrator } from "@/lib/media-workflow";

export type View =
  | "overview"
  | "ideas"
  | "approvals"
  | "design"
  | "calendar"
  | "archive"
  | "reports"
  | "admin";
const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: "overview", label: "نظرة عامة", icon: "home" },
  { id: "ideas", label: "الأفكار والمحتوى", icon: "ideas" },
  { id: "approvals", label: "اعتمادات المدير", icon: "check" },
  { id: "design", label: "استوديو التصميم", icon: "design" },
  { id: "calendar", label: "تقويم التنفيذ", icon: "calendar" },
  { id: "archive", label: "أرشيف الأعمال", icon: "archive" },
  { id: "reports", label: "التقارير الشهرية", icon: "report" },
];
const descriptions: Record<View, string> = {
  overview: "كل فكرة، وكل مرحلة، في مساحة واحدة.",
  ideas: "من فكرة واضحة إلى محتوى جاهز للاعتماد.",
  approvals: "راجع التفاصيل والعروض، ثم وجّه الفريق إلى الخطوة التالية.",
  design: "حوّل الأفكار المعتمدة إلى أعمال تستحق المشاهدة.",
  calendar: "رتّب التنفيذ والنشر حسب مواعيد الفريق.",
  archive: "ذاكرة الفريق؛ كل عمل وتفاصيله ونسخه النهائية.",
  reports: "وثّق أثر الفريق بتقرير شهري جاهز للمشاركة.",
  admin: "الشركات والتصنيفات وهوية التقارير وإعدادات الأرشفة.",
};
const production = ["approved", "scheduled", "designing", "design_review"];
const nameOf = (data: MediaData, id?: string) =>
  data.members.find((member) => member.id === id)?.name || "غير مسند";
const companyOf = (data: MediaData, id: string) =>
  data.companies.find((company) => company.id === id)?.name || "شركة";
function matches(idea: Idea, query: string, data: MediaData) {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u064B-\u065F]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .toLowerCase();
  return normalize(
    [
      idea.title,
      idea.code,
      idea.description,
      idea.content,
      idea.department,
      companyOf(data, idea.companyId),
      idea.sourceProposal?.proposerName,
      idea.sourceProposal?.originalGoal,
      idea.sourceProposal?.originalConcept,
      data.categories.find((c) => c.id === idea.categoryId)?.name,
      WORK_TYPE_LABELS[idea.workType],
      nameOf(data, idea.ownerId),
      ...idea.attachments.map((a) => a.name),
    ].join(" "),
  ).includes(normalize(query.trim()));
}

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
      <div
        dir="rtl"
        className="media-app flex min-h-dvh items-center justify-center px-4"
      >
        <form
          className="media-card w-full max-w-[30em] space-y-5 p-8"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              try {
                await store.setCurrentUser(loginMember, password, mfaNeeded ? mfaCode : undefined);
                setPassword(""); setMfaCode(""); setMfaNeeded(false); setNotice("");
              } catch (e) {
                if (e instanceof Error && "code" in e && e.code === "MFA_REQUIRED") { setMfaNeeded(true); setNotice(""); useMediaStore.setState({ error: null }); }
                else setNotice(errorText(e));
              }
            })();
          }}
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
            <Icon name="spark" className="size-8" />
          </div>
          <h1>مرحبًا بك في وصْل</h1>
          <p className="text-[var(--soft)]">
            مساحة فريق التواصل الداخلي، من أول فكرة إلى آخر تسليم.
          </p>
          {demo ? (
            <label className="media-label">
              حساب الفريق
              <select
                className="media-input mt-2"
                value={loginMember}
                onChange={(e) => setLoginMember(e.target.value)}
              >
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {memberDisplayLabel(member)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="media-label">
              اسم تسجيل الدخول
              <input
                className="media-input mt-2"
                dir="ltr"
                required
                autoComplete="username"
                name="username"
                value={loginMember}
                onChange={(e) => setLoginMember(e.target.value)}
                placeholder="اسم الدخول الذي حدده مسؤول النظام"
              />
            </label>
          )}
          {!demo && (
            <label className="media-label">
              كلمة المرور
              <input
                className="media-input mt-2"
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mfaNeeded && (
            <label className="media-label">
              رمز التحقق من تطبيق المصادقة
              <input
                className="media-input mt-2 text-center"
                dir="ltr"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
              />
            </label>
          )}
          {(error || notice) && (
            <p role="alert" className="text-[var(--danger)]">
              {notice || error}
            </p>
          )}
          <ActionButton
            primary
            type="submit"
            disabled={saving}
            className="w-full"
          >
            {saving ? "جارٍ الدخول…" : "دخول مساحة العمل"}
            <Icon name="arrow" />
          </ActionButton>
          {demo && (
            <p className="text-xs text-[var(--soft)]">
              وضع تجريبي لاستعراض الأدوار. تُفعّل حسابات الفريق المحمية من
              إعدادات الخادم.
            </p>
          )}
        </form>
      </div>
    );

  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-6 pt-8 pb-7">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-[#8170ef] text-white">
          <Icon name="spark" className="size-7" />
        </span>
        <div>
          <span className="block text-2xl font-bold">
            وصْل
            <span className="ms-2 text-xs font-normal text-[#b8b9d3]">
              WASL
            </span>
          </span>
          <span className="text-xs text-[#b8b9d3]">مساحة التواصل الداخلي</span>
        </div>
      </div>
      <div className="mx-4 mb-6 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
        <span className="mb-1 block text-xs text-[#b8b9d3]">
          مساحة العمل
        </span>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>فريق الاتصال المؤسسي</span>
          <span className="size-2 rounded-full bg-[#80d6b1]" />
        </div>
      </div>
      <nav aria-label="التنقل الرئيسي" className="space-y-1 px-3">
        {navigation.map((item) => (
          <ActionButton
            key={item.id}
            onClick={() => go(item.id)}
            aria-current={view === item.id ? "page" : undefined}
            className={`w-full justify-start gap-3 border-0 px-4 py-3 !shadow-none ${view === item.id ? "!bg-[#8170ef]/20 !text-[#dfd9ff]" : "!bg-transparent !text-[#b8b9d3] hover:!bg-white/5 hover:!text-white"}`}
          >
            <Icon name={item.icon} />
            <span className="flex-1 text-start">{item.label}</span>
            {item.id === "approvals" && pending > 0 && (
              <span className="rounded-md bg-[#f3bd77] px-1.5 text-xs text-[#43311c]">
                {pending}
              </span>
            )}
          </ActionButton>
        ))}
      </nav>
      <div className="mt-7 px-7 text-xs text-[#898da9]">الفريق</div>
      <div className="space-y-3 px-7 py-4">
        <div className="flex items-center gap-2 text-xs text-[#b8b9d3]">
          <span className="size-2 rounded-full bg-[#bea9ff]" />
          كتابة المحتوى والتنسيق
        </div>
        <div className="flex items-center gap-2 text-xs text-[#b8b9d3]">
          <span className="size-2 rounded-full bg-[#8ecbc4]" />
          التصميم والإنتاج
        </div>
      </div>
      <div className="mt-auto space-y-4 px-4 pt-8 pb-4">
        {isAdministrator(currentUser) && (
          <ActionButton
            onClick={() => go("admin")}
            aria-current={view === "admin" ? "page" : undefined}
            className={`w-full justify-start gap-3 !shadow-none ${view === "admin" ? "!bg-[#8170ef]/20 !text-white" : "!bg-transparent !text-[#b8b9d3]"}`}
          >
            <Icon name="settings" />
            إدارة النظام
          </ActionButton>
        )}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-[#d4d0f7]">
            <Icon name="spark" className="size-4" />
            أفكار أوضح. أثر أكبر.
          </div>
          <p className="text-xs text-[#b8b9d3]">
            مساحة تجمع إبداع الفريق وتوثّق كل إنجاز.
          </p>
        </div>
        <ActionButton
          onClick={() => setAccount(true)}
          className="w-full justify-start gap-3 !bg-transparent !px-1 !text-white !shadow-none"
        >
          <Avatar name={currentUser.name} />
          <div className="flex-1 text-start">
            <span className="block text-sm">{currentUser.name}</span>
            <span className="text-xs text-[#b8b9d3]">
              {memberDisplayLabel(currentUser)}
            </span>
          </div>
          <Icon name="settings" className="size-4 text-[#b8b9d3]" />
        </ActionButton>
      </div>
    </>
  );

  return (
    <div dir="rtl" className="media-app flex min-h-dvh bg-[var(--background)]">
      <a
        href="#workspace-content"
        className="sr-only z-[100] rounded-lg bg-white p-3 text-[var(--primary)] focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        انتقل إلى المحتوى
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[250px] shrink-0 flex-col bg-[#1d243c] text-white lg:flex">
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur-md lg:px-8">
          <div className="flex items-center gap-3">
            <ActionButton
              onClick={() => setMobileNav(true)}
              aria-label="فتح القائمة الرئيسية"
              className="size-10 px-0 lg:hidden"
            >
              <Icon name="list" />
            </ActionButton>
            <span className="hidden text-sm text-[var(--soft)] sm:block">
              مساحة العمل <span className="mx-3 text-[#bcc0cd]">/</span>
              <span className="text-[var(--foreground)]">
                {view === "admin"
                  ? "إدارة النظام"
                  : navigation.find((n) => n.id === view)?.label}
              </span>
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3 sm:flex-initial">
            <label className="relative w-full max-w-[24em] sm:w-64">
              <span className="sr-only">ابحث في كل الأفكار والأعمال</span>
              <Icon
                name="search"
                className="absolute start-3 top-3 size-4 text-[var(--soft)]"
              />
              <input
                type="search"
                className="media-input !min-h-10 !border-transparent !bg-[var(--background)] !ps-10"
                placeholder="ابحث عن فكرة أو عمل…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <ActionButton
              onClick={() => setNotifications(true)}
              aria-label={`فتح الإشعارات، ${unread.length} غير مقروءة`}
              className="relative size-10 px-0 !shadow-none"
            >
              <Icon name="bell" />
              {unread.length > 0 && (
                <span className="absolute end-2 top-1.5 size-2 rounded-full bg-[var(--danger)] ring-2 ring-white" />
              )}
            </ActionButton>
            <div className="hidden h-7 w-px bg-[var(--border)] sm:block" />
            <ActionButton
              onClick={() => setAccount(true)}
              aria-label="إعدادات الحساب"
              className="size-10 !rounded-full p-0 !shadow-none"
            >
              <Avatar name={currentUser.name} />
            </ActionButton>
          </div>
        </header>
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
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="إشعارات الفريق"
        description="المراجعات والتسليمات والعروض المتعلقة بعملك."
      >
        <div className="space-y-3 p-5">
          <ActionButton
            onClick={() => void run(() => store.markNotificationsRead())}
            className="w-full"
          >
            تحديد الكل كمقروء
          </ActionButton>
          {data.notifications.filter((n) => n.recipientId === currentUser.id)
            .length === 0 ? (
            <EmptyState
              title="أنت على اطلاع"
              description="ستظهر إشعارات المهام والمراجعات هنا."
            />
          ) : (
            data.notifications
              .filter((n) => n.recipientId === currentUser.id)
              .map((n) => (
                <ActionButton
                  key={n.id}
                  onClick={() => {
                    void run(() => store.markNotificationsRead([n.id]));
                    setSelected(n.ideaId);
                    setNotifications(false);
                  }}
                  className={`h-auto w-full items-start justify-start gap-3 px-4 py-4 text-start !whitespace-normal ${!n.read ? "!bg-[var(--accent)]" : ""}`}
                >
                  <Icon name="bell" className="size-4" />
                  <span className="leading-relaxed">
                    {n.title} · {n.body}
                    <span className="mt-1 block text-xs text-[var(--soft)]">
                      {formatDate(n.createdAt)}
                    </span>
                  </span>
                </ActionButton>
              ))
          )}
        </div>
      </Modal>
      <Modal
        open={account}
        onClose={() => setAccount(false)}
        title="حساب الفريق"
        description={
          demo
            ? "تبديل الحساب متاح في الوضع التجريبي لاستعراض الصلاحيات."
            : "صلاحياتك مرتبطة بحساب الفريق."
        }
      >
        <div className="space-y-5 p-6">
          <MfaSettings />
          <div className="flex items-center gap-3">
            <Avatar name={currentUser.name} />
            <div>
              <span className="block font-bold">{currentUser.name}</span>
              <span className="text-sm text-[var(--soft)]">
                {memberDisplayLabel(currentUser)}
              </span>
            </div>
          </div>
          {demo && (
            <label className="media-label">
              استعرض دورًا آخر
              <select
                className="media-input mt-2"
                value={currentUser.id}
                onChange={(e) =>
                  void run(async () => {
                    await store.setCurrentUser(e.target.value);
                    setAccount(false);
                    setSelected(null);
                    setEditor(false);
                    go("overview");
                  })
                }
              >
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {memberDisplayLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!demo && (
            <ActionButton
              onClick={() =>
                void run(async () => {
                  await fetch("/api/session", { method: "DELETE" });
                  window.location.reload();
                })
              }
            >
              <Icon name="logout" />
              تسجيل الخروج
            </ActionButton>
          )}
          <p className="text-sm text-[var(--soft)]">
            تُحفظ الأفكار والملفات في مساحة عمل مشتركة، وتظهر التحديثات تلقائيًا
            للفريق.
          </p>
        </div>
      </Modal>
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

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-[#d3c6f4] text-sm font-bold text-[#514077]"
    >
      {name
        .split(" ")
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}

export function IdeaCard({
  idea,
  data,
  onOpen,
}: {
  idea: Idea;
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  const late = idea.dueDate < today() && !["delivered", "cancelled", "rejected", "draft"].includes(idea.status);
  return (
    <ActionButton
      onClick={() => onOpen(idea.id)}
      className="media-card !block h-auto w-full !rounded-xl !p-4 text-start !whitespace-normal !shadow-[0_1px_2px_#20273c05,0_0_0_1px_#e5e7ef] hover:!shadow-[0_5px_14px_#20273c0a,0_0_0_1px_#c9c2ed]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--soft)]">
          <bdi>{idea.code}</bdi>
        </span>
        <PriorityBadge priority={idea.priority} />
      </div>
      <span className="block text-sm leading-relaxed font-bold">
        {idea.title}
      </span>
      {idea.sourceProposal && (
        <span className="mt-2 block text-xs font-medium text-[var(--primary)]">
          مقدم الفكرة: {idea.sourceProposal.proposerName}
        </span>
      )}
      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-[var(--soft)]">
        <CompanyLogo
          companyId={idea.companyId}
          decorative
          className="h-8 w-24 p-1"
        />
        <span className="min-w-0">{companyOf(data, idea.companyId)}</span>
      </span>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-md bg-[var(--background)] px-2 py-1 text-xs text-[var(--soft)]">
          {WORK_TYPE_LABELS[idea.workType]}
        </span>
        <span className="rounded-md bg-[var(--background)] px-2 py-1 text-xs text-[var(--soft)]">
          {data.categories.find((c) => c.id === idea.categoryId)?.name}
        </span>
      </div>
      {idea.managerFeedback && idea.status === "changes" && (
        <span className="mt-3 block rounded-md bg-[#fff1dc] px-2 py-1.5 text-xs leading-relaxed text-[var(--warning)]">
          ملاحظة المدير: {idea.managerFeedback}
        </span>
      )}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <span className="flex items-center gap-1.5 text-xs text-[var(--soft)]">
          <span className="flex size-6 items-center justify-center rounded-full bg-[var(--accent)] text-xs text-[var(--primary)]">
            {(production.includes(idea.status) ? idea.designerId : idea.ownerId) ? (
              nameOf(data, production.includes(idea.status) ? idea.designerId : idea.ownerId)[0]
            ) : (
              <Icon name="people" className="size-3.5" />
            )}
          </span>
          {
            nameOf(
              data,
              production.includes(idea.status) ? idea.designerId : idea.ownerId,
            ).split(" ")[0]
          }
        </span>
        <span
          className={`flex items-center gap-1 text-xs ${late ? "text-[var(--danger)]" : "text-[var(--soft)]"}`}
        >
          <Icon name="calendar" className="size-3.5" />
          {formatDate(idea.dueDate)}
          {late && " · متأخر"}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Channels channels={idea.channels} />
        <span className="flex items-center gap-1 text-xs text-[var(--soft)]">
          <Icon name="file" className="size-3" />
          {idea.attachments.length}
        </span>
      </div>
    </ActionButton>
  );
}

function Overview({
  data,
  currentId,
  onOpen,
  onView,
}: {
  data: MediaData;
  currentId: string;
  onOpen: (id: string) => void;
  onView: (view: View) => void;
}) {
  const month = today().slice(0, 7);
  const complete = data.ideas.filter(
    (i) => i.status === "delivered" && i.deliveredAt?.startsWith(month),
  );
  const waiting = data.ideas.filter((i) => i.status === "review");
  const active = data.ideas.filter((i) => production.includes(i.status));
  const late = data.ideas.filter(
    (i) => i.dueDate < today() && !["delivered", "cancelled", "rejected", "draft"].includes(i.status),
  );
  const attention = data.ideas
    .filter(
      (i) =>
        i.status !== "delivered" &&
        (i.ownerId === currentId ||
          i.designerId === currentId ||
          i.status === "review"),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);
  const stats = [
    {
      value: complete.length,
      label: "أعمال مسلّمة هذا الشهر",
      icon: "check" as IconName,
      note: "موثّقة في الأرشيف",
      tone: "success",
    },
    {
      value: active.length,
      label: "أعمال في استوديو التصميم",
      icon: "design" as IconName,
      note: "معتمدة وجاهزة للتنفيذ",
      tone: "accent",
    },
    {
      value: waiting.length,
      label: "أفكار بانتظار الاعتماد",
      icon: "clock" as IconName,
      note: "الخطوة التالية لدى المدير",
      tone: "warning",
    },
    {
      value: late.length,
      label: "أعمال تجاوزت موعدها",
      icon: "calendar" as IconName,
      note: "تحتاج متابعة الفريق",
      tone: "neutral",
    },
  ];
  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-[#eeebfc] px-6 py-6 sm:px-8">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-[#5140b8]">
              <Icon name="spark" className="size-4" />
              الإبداع يبدأ بفكرة… ويكتمل مع الفريق
            </div>
            <h2>مسار واضح لكل فكرة. مساحة أكبر للإبداع.</h2>
            <p className="mt-2 max-w-[44em] text-[#5d5680]">
              المحتوى يضع الفكرة، المدير يعتمدها، والتصميم يمنحها الحياة. تابع
              كل خطوة من هنا.
            </p>
          </div>
          <ActionButton
            onClick={() => onView("ideas")}
            className="!bg-white/70"
          >
            استعرض مسار الأفكار
            <Icon name="arrow" className="size-4" />
          </ActionButton>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute end-[-40px] -bottom-16 size-60 rounded-full border-[28px] border-white/35"
        />
      </section>
      <section
        aria-label="إحصائيات الفريق"
        className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <div key={stat.label} className="media-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-[var(--soft)]">{stat.label}</span>
              <span
                className={`media-badge media-badge-${stat.tone} !rounded-lg !p-2`}
              >
                <Icon name={stat.icon} className="size-4" />
              </span>
            </div>
            <div className="text-3xl font-bold tabular-nums">
              {stat.value.toLocaleString("ar-SA")}
            </div>
            <span className="mt-2 block text-xs text-[var(--soft)]">
              {stat.note}
            </span>
          </div>
        ))}
      </section>
      <section className="media-card p-5 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h2>من الفكرة إلى الأثر</h2>
            <p className="mt-1 text-xs text-[var(--soft)]">
              حركة الأعمال عبر مراحل الفريق
            </p>
          </div>
          <span className="text-xs text-[var(--soft)]">
            {countText(data.ideas.length, "work")} في المساحة
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {[
            {
              label: "كتابة المحتوى",
              statuses: ["draft", "quotations", "changes"],
              icon: "ideas",
              view: "ideas",
            },
            {
              label: "مراجعة المدير",
              statuses: ["review"],
              icon: "check",
              view: "approvals",
            },
            {
              label: "جدولة التصميم",
              statuses: ["approved", "scheduled"],
              icon: "calendar",
              view: "design",
            },
            {
              label: "التصميم والإنتاج",
              statuses: ["designing", "design_review"],
              icon: "design",
              view: "design",
            },
            {
              label: "التسليم والأرشفة",
              statuses: ["delivered"],
              icon: "archive",
              view: "archive",
            },
          ].map((stage, index) => (
            <ActionButton
              key={stage.label}
              onClick={() => onView(stage.view as View)}
              className="relative !flex h-auto flex-col gap-3 !rounded-xl !bg-[var(--background)] py-5 !shadow-none"
            >
              <span
                className={`flex size-10 items-center justify-center rounded-full ${index === 4 ? "bg-[#e6f4ee] text-[var(--success)]" : "bg-[var(--accent)] text-[var(--primary)]"}`}
              >
                <Icon name={stage.icon as IconName} />
              </span>
              <span className="text-xs">{stage.label}</span>
              <span className="text-xl font-bold tabular-nums">
                {data.ideas
                  .filter((i) => stage.statuses.includes(i.status))
                  .length.toLocaleString("ar-SA")}
              </span>
            </ActionButton>
          ))}
        </div>
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="media-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <div>
              <h2>تحتاج انتباهك</h2>
              <p className="mt-1 text-xs text-[var(--soft)]">
                المواعيد القريبة والمراجعات المعلّقة
              </p>
            </div>
            <ActionButton
              onClick={() => onView("calendar")}
              className="!px-3 !text-xs"
            >
              عرض التقويم
              <Icon name="arrow" className="size-3.5" />
            </ActionButton>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {attention.length ? (
              attention.map((idea) => (
                <ActionButton
                  key={idea.id}
                  onClick={() => onOpen(idea.id)}
                  className="h-auto w-full justify-between gap-4 !rounded-none px-6 py-4 text-start !whitespace-normal !shadow-none"
                >
                  <span className="min-w-0">
                    <span className="block text-sm leading-relaxed font-medium">
                      {idea.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[var(--soft)]">
                      {idea.department} · {formatDate(idea.dueDate)}
                    </span>
                  </span>
                  <StatusBadge status={idea.status} />
                </ActionButton>
              ))
            ) : (
              <div className="px-6 py-8 text-sm text-[var(--soft)]">
                لا توجد أعمال معلّقة لديك حاليًا.
              </div>
            )}
          </div>
        </section>
        <section className="media-card p-6">
          <div className="mb-5">
            <h2>توازن المحتوى</h2>
            <p className="mt-1 text-xs text-[var(--soft)]">
              توزيع أفكار هذا الشهر على التصنيفات
            </p>
          </div>
          <div className="space-y-4">
            {data.categories.map((category) => {
              const count = data.ideas.filter(
                (i) =>
                  i.categoryId === category.id &&
                  i.requestedAt.startsWith(month),
              ).length;
              const total = Math.max(
                1,
                data.ideas.filter((i) => i.requestedAt.startsWith(month))
                  .length,
              );
              return (
                <div key={category.id}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span>{category.name}</span>
                    <span className="text-[var(--soft)]">
                      {count ? countText(count, "idea") : "يحتاج محتوى"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
                    <div
                      className="h-full rounded-full bg-[#9c8fe8]"
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 rounded-xl bg-[var(--background)] px-3 py-3 text-xs leading-relaxed text-[var(--soft)]">
            التصنيفات التي لم تُغطَّ بعد تساعد الفريق على التخطيط لمحتوى أكثر
            تنوعًا.
          </div>
        </section>
      </div>
    </>
  );
}

function WorkBoard({
  mode,
  data,
  onOpen,
}: {
  mode: "content" | "design";
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  const [company, setCompany] = useState("all"),
    [category, setCategory] = useState("all"),
    [proposer, setProposer] = useState("all"),
    [mine, setMine] = useState(false),
    [showClosed, setShowClosed] = useState(false),
    [view, setView] = useState("board");
  const user = useMediaStore((s) => s.currentUser);
  const stages =
    mode === "content"
      ? ["draft", "quotations", "review", "changes", ...(showClosed ? ["rejected", "cancelled"] : [])]
      : ["approved", "scheduled", "designing", "design_review", "delivered"];
  const closedCount = data.ideas.filter((i) => i.status === "rejected" || i.status === "cancelled").length;
  const ideas = data.ideas.filter(
    (i) =>
      stages.includes(i.status) &&
      (company === "all" || i.companyId === company) &&
      (category === "all" || i.categoryId === category) &&
      (proposer === "all" ||
        (proposer === "__imported"
          ? !!i.sourceProposal
          : i.sourceProposal?.proposerName === proposer)) &&
      (!mine || i.ownerId === user?.id || i.designerId === user?.id),
  );
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {mode === "content" && closedCount > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              إظهار المرفوضة والملغاة ({closedCount})
            </label>
          )}
          <label>
            <span className="sr-only">تصفية حسب الشركة</span>
            <select
              className="media-input !w-auto"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="all">كل الشركات</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">تصفية حسب التصنيف</span>
            <select
              className="media-input !w-auto"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">كل التصنيفات</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {data.ideas.some((idea) => idea.sourceProposal) && (
            <label>
              <span className="sr-only">تصفية حسب مقدم الفكرة</span>
              <select
                className="media-input !w-auto"
                value={proposer}
                onChange={(event) => setProposer(event.target.value)}
              >
                <option value="all">كل مقدمي الأفكار</option>
                <option value="__imported">مقترحات الملف المرفق</option>
                {Array.from(
                  new Set(
                    data.ideas.flatMap((idea) =>
                      idea.sourceProposal
                        ? [idea.sourceProposal.proposerName]
                        : [],
                    ),
                  ),
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            أعمالي فقط
          </label>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--soft)]">
            {countText(ideas.length, "work")}
          </span>
          <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-[var(--border)]">
            <ActionButton
              aria-label="عرض اللوحة"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={`size-9 px-0 !shadow-none ${view === "board" ? "!bg-[var(--accent)] !text-[var(--primary)]" : ""}`}
            >
              <Icon name="grid" className="size-4" />
            </ActionButton>
            <ActionButton
              aria-label="عرض القائمة"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`size-9 px-0 !shadow-none ${view === "list" ? "!bg-[var(--accent)] !text-[var(--primary)]" : ""}`}
            >
              <Icon name="list" className="size-4" />
            </ActionButton>
          </div>
        </div>
      </div>
      {view === "list" ? (
        <IdeaList ideas={ideas} data={data} onOpen={onOpen} />
      ) : (
        <div
          className={`grid items-start gap-4 min-[700px]:grid-cols-2 ${mode === "content" ? "xl:grid-cols-4" : "xl:grid-cols-3 2xl:grid-cols-5"}`}
        >
          {stages.map((stage) => (
            <section
              key={stage}
              className="min-w-0 rounded-2xl bg-[#ebedf4] p-3"
            >
              <div className="mb-4 flex items-center justify-between px-1 py-1">
                <h2 className="!text-sm">
                  {STATUS_LABELS[stage as Idea["status"]]}
                </h2>
                <span className="flex size-6 items-center justify-center rounded-md bg-white text-xs text-[var(--soft)]">
                  {ideas.filter((i) => i.status === stage).length}
                </span>
              </div>
              <div className="space-y-3">
                {ideas
                  .filter((i) => i.status === stage)
                  .sort(
                    (a, b) =>
                      rank[a.priority] - rank[b.priority] ||
                      a.dueDate.localeCompare(b.dueDate),
                  )
                  .map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      data={data}
                      onOpen={onOpen}
                    />
                  ))}
                {!ideas.some((i) => i.status === stage) && (
                  <div className="rounded-xl border border-dashed border-[#cdd2df] px-4 py-10 text-center text-xs leading-relaxed text-[var(--soft)]">
                    {stage === "approved"
                      ? "تنتقل الأفكار إلى هنا بعد اعتماد المدير."
                      : "لا توجد أعمال في هذه المرحلة."}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {mode === "design" && (
        <div className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm text-[var(--soft)]">
          <Icon name="screen" className="mt-0.5 size-4" />
          <p>
            تُرتَّب الأعمال حسب الأولوية والموعد. افتح أي عمل لجدولته وتسليم
            نسخة 16:9 للشاشات، و9:16 للواتساب، ونسخة مناسبة للإيميل حسب القنوات
            المطلوبة.
          </p>
        </div>
      )}
    </>
  );
}

export function IdeaList({
  ideas,
  data,
  onOpen,
}: {
  ideas: Idea[];
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  if (!ideas.length)
    return (
      <EmptyState
        title="لا توجد أعمال مطابقة"
        description="جرّب تغيير البحث أو عوامل التصفية لإظهار المزيد من الأعمال."
      />
    );
  return (
    <div className="media-card overflow-hidden">
      <div className="hidden grid-cols-[1.7fr_1fr_1fr_.8fr_.7fr] gap-4 border-b border-[var(--border)] bg-[var(--background)] px-6 py-3 text-xs text-[var(--soft)] md:grid">
        <span>العمل</span>
        <span>الشركة والإدارة</span>
        <span>الحالة</span>
        <span>المسؤول</span>
        <span>موعد التسليم</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {ideas.map((idea) => (
          <ActionButton
            key={idea.id}
            onClick={() => onOpen(idea.id)}
            className="grid h-auto w-full grid-cols-1 items-center gap-3 !rounded-none px-6 py-5 text-start !whitespace-normal !shadow-none md:grid-cols-[1.7fr_1fr_1fr_.8fr_.7fr]"
          >
            <span>
              <span className="block text-xs text-[var(--soft)]">
                <bdi>{idea.code}</bdi> · {WORK_TYPE_LABELS[idea.workType]}
              </span>
              <span className="mt-1 block leading-relaxed font-bold">
                {idea.title}
              </span>
              {idea.sourceProposal && (
                <span className="mt-1 block text-xs text-[var(--primary)]">
                  مقدم الفكرة: {idea.sourceProposal.proposerName}
                </span>
              )}
            </span>
            <span className="text-xs leading-relaxed text-[var(--soft)]">
              <CompanyLogo
                companyId={idea.companyId}
                decorative
                className="mb-1 h-8 w-24 p-1"
              />
              <span className="block">{companyOf(data, idea.companyId)}</span>
              <span className="block">{idea.department}</span>
            </span>
            <span>
              <StatusBadge status={idea.status} />
            </span>
            <span className="text-xs text-[var(--soft)]">
              {nameOf(
                data,
                production.includes(idea.status)
                  ? idea.designerId
                  : idea.ownerId,
              )}
            </span>
            <span className="text-xs text-[var(--soft)]">
              {formatDate(
                idea.status === "delivered" ? idea.deliveredAt : idea.dueDate,
              )}
            </span>
          </ActionButton>
        ))}
      </div>
    </div>
  );
}

function Calendar({
  data,
  onOpen,
}: {
  data: MediaData;
  onOpen: (id: string) => void;
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [kind, setKind] = useState("schedule");
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7)) - 1;
  const days = new Date(year, m + 1, 0).getDate(),
    offset = new Date(year, m, 1).getDay();
  const shift = (direction: number) => {
    const next = new Date(year, m + direction, 1);
    setMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const dateFor = (idea: Idea) =>
    kind === "schedule" ? idea.scheduledAt : idea.dueDate;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ActionButton
            onClick={() => shift(-1)}
            aria-label="الشهر السابق"
            className="size-10 px-0"
          >
            <Icon name="chevron" />
          </ActionButton>
          <label>
            <span className="sr-only">شهر التقويم</span>
            <input
              type="month"
              className="media-input !w-auto"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
          <ActionButton
            onClick={() => shift(1)}
            aria-label="الشهر التالي"
            className="size-10 px-0"
          >
            <Icon name="chevron" className="rotate-180" />
          </ActionButton>
          <ActionButton onClick={() => setMonth(today().slice(0, 7))}>
            اليوم
          </ActionButton>
        </div>
        <label className="flex items-center gap-3 text-sm">
          عرض المواعيد
          <select
            className="media-input !w-auto"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="schedule">جدولة التنفيذ</option>
            <option value="delivery">التسليم المطلوب</option>
          </select>
        </label>
      </div>
      <div className="media-card hidden overflow-hidden md:block">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-white">
          {[
            "الأحد",
            "الإثنين",
            "الثلاثاء",
            "الأربعاء",
            "الخميس",
            "الجمعة",
            "السبت",
          ].map((d) => (
            <span
              key={d}
              className="p-4 text-center text-xs text-[var(--soft)]"
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from(
            { length: Math.ceil((days + offset) / 7) * 7 },
            (_, i) => {
              const d = i - offset + 1,
                valid = d > 0 && d <= days;
              const date = `${month}-${String(d).padStart(2, "0")}`;
              return (
                <div
                  key={i}
                  className={`min-h-[130px] min-w-0 border-e border-b border-[var(--border)] p-2 ${valid ? "bg-white" : "bg-[var(--background)]"}`}
                >
                  {valid && (
                    <>
                      <span
                        className={`mb-2 flex size-7 items-center justify-center rounded-full text-xs ${date === today() ? "bg-[var(--primary)] text-white" : "text-[var(--soft)]"}`}
                      >
                        {d.toLocaleString("ar-SA")}
                      </span>
                      <div className="space-y-1.5">
                        {data.ideas
                          .filter(
                            (idea) => dateFor(idea)?.slice(0, 10) === date,
                          )
                          .map((idea) => (
                            <ActionButton
                              key={idea.id}
                              onClick={() => onOpen(idea.id)}
                              className="h-auto w-full justify-start !rounded-md !bg-[var(--accent)] !p-2 !text-start text-xs !whitespace-normal !shadow-none"
                            >
                              <span className="leading-relaxed">
                                {idea.title}
                              </span>
                            </ActionButton>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const ideas = data.ideas.filter(
            (idea) => dateFor(idea)?.slice(0, 10) === date,
          );
          return ideas.length ? (
            <section key={date} className="media-card p-4">
              <h2 className="mb-3 !text-sm">
                {formatDate(date, { weekday: "long" })}
              </h2>
              <div className="space-y-2">
                {ideas.map((idea) => (
                  <ActionButton
                    key={idea.id}
                    onClick={() => onOpen(idea.id)}
                    className="h-auto w-full justify-between py-3 text-start !whitespace-normal"
                  >
                    <span className="leading-relaxed">{idea.title}</span>
                    <StatusBadge status={idea.status} />
                  </ActionButton>
                ))}
              </div>
            </section>
          ) : null;
        })}
        {!data.ideas.some((i) => dateFor(i)?.startsWith(month)) && (
          <EmptyState
            title="شهر بلا مواعيد مجدولة"
            description="حدّد موعد تنفيذ الأعمال من استوديو التصميم لتظهر هنا."
          />
        )}
      </div>
    </>
  );
}

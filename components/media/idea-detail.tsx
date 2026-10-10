"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  CHANNEL_LABELS,
  PRIORITY_LABELS,
  WORK_TYPE_LABELS,
  type Attachment,
  type Channel,
  type Idea,
  type Priority,
} from "@/data/media";
import { postJson } from "@/lib/api-client";
import { useMediaStore } from "@/stores/media-store";
import {
  ActionButton,
  Channels,
  Icon,
  Modal,
  PriorityBadge,
  StatusBadge,
  TabList,
  bytes,
  errorText,
  formatDate,
  today,
} from "./ui";
import { uploadFiles } from "./idea-editor";
import { PresentationPreview } from "./presentation";
import { CompanyLogo } from "./company-logo";
import { canCancelIdea, canDeleteIdea, canReopenIdea, canWithdrawIdea, isAdministrator } from "@/lib/media-workflow";

const LIFECYCLE = {
  reject: { title: "رفض الفكرة نهائياً", description: "تُغلق الفكرة ولا تعود للتعديل. يصل السبب إلى صاحبها.", label: "سبب الرفض", action: "رفض الفكرة", done: "رُفضت الفكرة وأُشعر صاحبها." },
  cancel: { title: "إلغاء الفكرة", description: "تبقى الفكرة في السجل بحالة «ملغاة»، ويمكن لمدير النظام إعادة فتحها.", label: "سبب الإلغاء", action: "إلغاء الفكرة", done: "أُلغيت الفكرة." },
  reopen: { title: "إعادة فتح العمل", description: "يعود العمل المسلّم إلى التصميم، وتعود الفكرة الملغاة أو المرفوضة إلى المسودة.", label: "سبب إعادة الفتح", action: "إعادة الفتح", done: "أُعيد فتح العمل." },
  delete: { title: "حذف الفكرة نهائياً", description: "تُحذف الفكرة وسجلها ومرفقاتها من النظام، وتبقى نسخة منها في سجل الحذف لمدير النظام. ملفاتها في Google Drive لا تُحذف.", label: "سبب الحذف (اختياري)", action: "حذف الفكرة نهائياً", done: "حُذفت الفكرة." },
} as const;

const ARCHIVE_TEXT: Record<string, string> = { done: "أُرشف العمل في مجلد المشروع على Google Drive.", pending: "بانتظار الأرشفة التلقائية في Google Drive.", running: "جارٍ رفع العمل إلى Google Drive.", failed: "تعذّرت الأرشفة مؤقتاً، وستُعاد المحاولة تلقائياً.", needs_review: "الأرشفة تحتاج مراجعة مدير النظام.", not_started: "لم يُؤرشف هذا العمل بعد." };

export default function IdeaDetail({
  idea,
  onClose,
  onEdit,
}: {
  idea: Idea;
  onClose: () => void;
  onEdit: () => void;
}) {
  const store = useMediaStore(),
    { data, currentUser } = store;
  const [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState(""),
    [returnDialog, setReturnDialog] = useState(false);
  const [lifecycle, setLifecycle] = useState<{ kind: "reject" | "cancel" | "reopen" | "delete"; text: string } | null>(null);
  const [reassign, setReassign] = useState<{ ownerId: string; designerId: string } | null>(null);
  const defaultDesigner = () =>
    (data.members.some((m) => m.id === idea.designerId && m.active && m.role === "designer") ? idea.designerId : "") ||
    (currentUser?.role === "designer" ? currentUser.id : data.members.find((m) => m.role === "designer" && m.active)?.id) ||
    "";
  const [designer, setDesigner] = useState(defaultDesigner),
    [scheduled, setScheduled] = useState(idea.scheduledAt || today()),
    [due, setDue] = useState(idea.dueDate),
    [priority, setPriority] = useState(idea.priority);
  const [channel, setChannel] = useState<Channel>(idea.channels[0]),
    [kind, setKind] = useState<Attachment["kind"]>("brief"),
    [uploading, setUploading] = useState<File[]>([]),
    [comment, setComment] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false),
    [vendor, setVendor] = useState(""),
    [scope, setScope] = useState(""),
    [amount, setAmount] = useState(""),
    [days, setDays] = useState(""),
    [recommended, setRecommended] = useState(false),
    [quoteFile, setQuoteFile] = useState<File | null>(null),
    [pendingQuoteAttachment, setPendingQuoteAttachment] =
      useState<Attachment | null>(null),
    [pendingUpload, setPendingUpload] = useState<Attachment[]>([]),
    [scheduleBaseline, setScheduleBaseline] = useState({ designerId: idea.designerId, scheduledAt: idea.scheduledAt, dueDate: idea.dueDate, priority: idea.priority as string });
  const admin = isAdministrator(currentUser),
    canContent =
      admin ||
      (currentUser?.role === "content" && idea.ownerId === currentUser.id),
    canEdit =
      canContent && ["draft", "quotations", "changes"].includes(idea.status);
  const canReview =
    (admin || currentUser?.role === "manager") && idea.status === "review" && idea.ownerId !== currentUser?.id;
  const canDesign =
    admin ||
    (currentUser?.role === "designer" &&
      (idea.designerId === currentUser.id || !idea.designerId));
  const designStage = [
    "approved",
    "scheduled",
    "designing",
    "design_review",
  ].includes(idea.status);
  const pendingQuoteId = useRef<string | null>(null);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!uploading.length) {
      setMessage("اختر ملفًا واحدًا على الأقل لرفعه.");
      return;
    }
    await run(async () => {
      const attachments = pendingUpload.length
        ? pendingUpload
        : await uploadFiles(
            uploading,
            idea.id,
            kind,
            kind === "final" ? channel : undefined,
          );
      setPendingUpload(attachments);
      const latest = useMediaStore
        .getState()
        .data.ideas.find((i) => i.id === idea.id)!;
      const missing = attachments.filter(
        (a) => !latest.attachments.some((f) => f.id === a.id),
      );
      if (missing.length) await store.addAttachments(idea.id, missing);
      setPendingUpload([]);
      setUploading([]);
    }, "تم رفع الملفات وحفظها في الفكرة.");
  };
  const addQuote = async (e: FormEvent) => {
    e.preventDefault();
    if (!quoteFile) {
      setMessage("أرفق ملف عرض السعر قبل حفظه.");
      return;
    }
    await run(async () => {
      const attachment =
        pendingQuoteAttachment ||
        (await uploadFiles([quoteFile], idea.id, "quotation"))[0];
      setPendingQuoteAttachment(attachment);
      if (
        !useMediaStore
          .getState()
          .data.ideas.find((i) => i.id === idea.id)!
          .attachments.some((a) => a.id === attachment.id)
      )
        await store.addAttachments(idea.id, [attachment]);
      const quoteId = pendingQuoteId.current || crypto.randomUUID();
      pendingQuoteId.current = quoteId;
      if (
        !useMediaStore
          .getState()
          .data.ideas.find((i) => i.id === idea.id)!
          .quotations.some((q) => q.id === quoteId)
      )
        await store.addQuotation(idea.id, {
          id: quoteId,
          vendor,
          scope,
          amount: Number(amount),
          days: Number(days),
          recommended,
          attachmentId: attachment.id,
        });
      setQuoteOpen(false);
      setVendor("");
      setScope("");
      setAmount("");
      setDays("");
      setQuoteFile(null);
      setPendingQuoteAttachment(null);
      pendingQuoteId.current = null;
    }, "أُضيف عرض السعر، وأُشعر مسؤول المحتوى والتنسيق.");
  };
  const tabs = [
    { id: "overview", label: "الملخص" },
    { id: "content", label: "المحتوى والخطة" },
    { id: "quotations", label: `العروض (${idea.quotations.length})` },
    { id: "presentation", label: "عرض الاعتماد" },
    { id: "files", label: `الملفات (${idea.attachments.length})` },
    { id: "activity", label: "سجل العمل" },
  ];
  return (
    <>
      <Modal
        open
        onClose={onClose}
        locked={busy}
        drawer
        title={idea.title}
        description={`${idea.code} · ${data.companies.find((c) => c.id === idea.companyId)?.name}`}
      >
        <div className="space-y-5 p-5 sm:p-6">
          <CompanyLogo
            companyId={idea.companyId}
            companyName={
              data.companies.find((c) => c.id === idea.companyId)?.name
            }
            className="h-12 w-40"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={idea.status} />
              <PriorityBadge priority={idea.priority} />
              <span className="rounded-lg bg-[var(--background)] px-2 py-1 text-xs text-[var(--soft)]">
                {WORK_TYPE_LABELS[idea.workType]}
              </span>
            </div>
            {canEdit && (
              <ActionButton onClick={onEdit}>
                <Icon name="design" className="size-4" />
                تعديل الفكرة
              </ActionButton>
            )}
          </div>
          {idea.sourceProposal && (
            <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
              <h2 className="!text-base">إسناد المقترح</h2>
              <p className="text-sm">
                <strong>مقدم الفكرة: {idea.sourceProposal.proposerName}</strong>
              </p>
              <p className="text-xs text-[var(--soft)]">
                حُفظت الفكرة من قائمة المقترحات المرفقة. مسؤول التنسيق قابل
                للتغيير، ويبقى إسناد الفكرة إلى صاحبها محفوظًا.
              </p>
              {idea.sourceProposal.funding && (
                <p className="text-xs text-[var(--soft)]">
                  نوع التنفيذ في المصدر: {idea.sourceProposal.funding}
                </p>
              )}
              {idea.sourceProposal.sourceApproval && (
                <p className="text-xs text-[var(--soft)]">
                  حالة الفكرة في الملف المرفق:{" "}
                  {idea.sourceProposal.sourceApproval}. الاعتماد داخل النظام
                  يظهر في حالة العمل وسجل المدير.
                </p>
              )}
              {idea.sourceProposal.reviewNote && (
                <p className="rounded-lg bg-[#fff1dc] p-3 text-sm text-[var(--warning)]">
                  {idea.sourceProposal.reviewNote}
                </p>
              )}
              <details className="text-sm">
                <summary className="min-h-10 cursor-pointer py-2 font-medium text-[var(--primary)]">
                  النص الأصلي للمقترح
                </summary>
                <div className="space-y-3 pt-2">
                  <p className="whitespace-pre-wrap">
                    {idea.sourceProposal.originalGoal}
                  </p>
                  <p className="whitespace-pre-wrap">
                    {idea.sourceProposal.originalConcept}
                  </p>
                </div>
              </details>
            </section>
          )}
          {idea.managerFeedback && (
            <div className="rounded-xl border border-[#efd4a5] bg-[#fff5e5] p-4">
              <div className="flex items-center gap-2 font-bold text-[var(--warning)]">
                <Icon name="ideas" className="size-4" />
                ملاحظة المدير {idea.status === "changes" && "· تحتاج إجراء"}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[var(--warning)]">
                {idea.managerFeedback}
              </p>
              {idea.status === "changes" && (
                <span className="mt-2 block text-xs text-[var(--warning)]">
                  عدّل الفكرة ثم أرسلها للمراجعة مجددًا. تبقى هذه الملاحظة
                  محفوظة في سجل العمل.
                </span>
              )}
            </div>
          )}
          {["draft", "quotations", "review", "changes"].includes(
            idea.status,
          ) && (
            <div className="flex items-start gap-2 rounded-xl bg-[var(--background)] p-3 text-xs text-[var(--soft)]">
              <Icon name="clock" className="mt-0.5 size-4" />
              <span>
                لم تُعتمد هذه الفكرة بعد. تنتقل إلى التصميم تلقائيًا عند اعتماد
                المدير.
              </span>
            </div>
          )}
          <div className="border-b border-[var(--border)] pb-3">
            <TabList label="تفاصيل الفكرة" idPrefix="idea" compact value={tab} onChange={setTab} items={tabs} />
          </div>
          <div role="tabpanel" id="idea-panel" aria-labelledby={`idea-tab-${tab}`}>
            {tab === "overview" && (
              <div className="space-y-6">
                <section>
                  <h2>الفكرة والهدف</h2>
                  <p className="mt-3 max-w-[65em] whitespace-pre-wrap">
                    {idea.description}
                  </p>
                </section>
                <dl className="grid grid-cols-1 gap-4 rounded-2xl bg-[var(--background)] p-5 sm:grid-cols-2">
                  {[
                    { label: "الإدارة المستفيدة", value: idea.department },
                    {
                      label: "تصنيف المحتوى",
                      value: data.categories.find(
                        (c) => c.id === idea.categoryId,
                      )?.name,
                    },
                    {
                      label: "مسؤول المحتوى والتنسيق",
                      value: data.members.find((m) => m.id === idea.ownerId)
                        ?.name,
                    },
                    {
                      label: "مسؤول التصميم",
                      value:
                        data.members.find((m) => m.id === idea.designerId)
                          ?.name || "بانتظار الإسناد",
                    },
                    {
                      label: "تاريخ الطلب",
                      value: formatDate(idea.requestedAt, { year: "numeric" }),
                    },
                    {
                      label: "موعد التسليم المطلوب",
                      value: formatDate(idea.dueDate, { year: "numeric" }),
                    },
                    {
                      label: "بداية التنفيذ",
                      value: formatDate(idea.scheduledAt),
                    },
                    {
                      label: "تاريخ التسليم الفعلي",
                      value: idea.deliveredAt
                        ? formatDate(idea.deliveredAt)
                        : "لم يُسلّم بعد",
                    },
                  ].map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs text-[var(--soft)]">
                        {item.label}
                      </dt>
                      <dd className="mt-1 text-sm font-medium">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                <section>
                  <h2 className="mb-3">قنوات النشر</h2>
                  <Channels channels={idea.channels} labels />
                </section>
                <div className="flex flex-wrap gap-3">
                  <ActionButton onClick={() => setTab("presentation")}>
                    <Icon name="report" className="size-4" />
                    استعرض عرض الاعتماد
                  </ActionButton>
                  <ActionButton onClick={() => setTab("files")}>
                    <Icon name="file" className="size-4" />
                    استعرض المرفقات
                  </ActionButton>
                </div>
              </div>
            )}
            {tab === "content" && (
              <div className="space-y-6">
                <section>
                  <h2>نص المحتوى</h2>
                  <div className="mt-3 rounded-xl bg-[var(--background)] p-5">
                    <p className="whitespace-pre-wrap">{idea.content}</p>
                  </div>
                </section>
                <section>
                  <h2>خطة التنفيذ</h2>
                  <p className="mt-3 whitespace-pre-wrap">
                    {idea.executionPlan}
                  </p>
                </section>
                <section>
                  <h2>المخرجات المتوقعة</h2>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {idea.channels.map((c) => (
                      <div
                        key={c}
                        className="rounded-xl border border-[var(--border)] p-4"
                      >
                        <Icon
                          name={c === "screens" ? "screen" : c}
                          className="mb-3 text-[var(--primary)]"
                        />
                        <span className="block font-medium">
                          {CHANNEL_LABELS[c]}
                        </span>
                        <span className="text-xs text-[var(--soft)]">
                          {c === "screens"
                            ? "نسخة أفقية بنسبة 16:9"
                            : c === "whatsapp"
                              ? "نسخة عمودية بنسبة 9:16"
                              : "تصميم للرسائل الداخلية"}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
            {tab === "quotations" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[var(--soft)]">
                    {idea.needsQuotes
                      ? "العروض ومرفقاتها جزء من عرض الاعتماد."
                      : "هذه الفكرة مُعدّة للتنفيذ الداخلي."}
                  </p>
                  {canEdit && (
                    <ActionButton onClick={() => setQuoteOpen(true)}>
                      <Icon name="plus" className="size-4" />
                      إضافة عرض سعر
                    </ActionButton>
                  )}
                </div>
                {idea.quotations.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--input)] p-8 text-center text-sm text-[var(--soft)]">
                    {idea.needsQuotes
                      ? "أرفق عرض سعر واحدًا على الأقل قبل إرسال الفكرة للاعتماد."
                      : "لا توجد عروض أسعار مرفقة."}
                  </div>
                )}
                {idea.quotations.map((q) => {
                  const file = idea.attachments.find(
                    (a) => a.id === q.attachmentId,
                  );
                  return (
                    <div
                      key={q.id}
                      className={`rounded-xl border p-5 ${q.recommended ? "border-[#c0b4e8] bg-[#f7f5ff]" : "border-[var(--border)]"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="!text-base">{q.vendor}</h2>
                        {q.recommended && (
                          <span className="media-badge media-badge-accent">
                            العرض الموصى به
                          </span>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-[var(--soft)]">
                        {q.scope}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xl font-bold tabular-nums">
                          {q.amount.toLocaleString("ar-SA")}{" "}
                          <span className="text-xs font-normal text-[var(--soft)]">
                            ر.س.
                          </span>
                        </span>
                        <span className="text-sm text-[var(--soft)]">
                          مدة التنفيذ: {q.days} أيام
                        </span>
                      </div>
                      {file && (
                        <a
                          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs underline decoration-[#b4accc] underline-offset-4"
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon name="file" className="size-4" />
                          <bdi>{file.name}</bdi>
                          <Icon name="download" className="size-3.5" />
                        </a>
                      )}
                      {canEdit && (
                        <ActionButton
                          onClick={() => {
                            if (
                              window.confirm(
                                "حذف عرض السعر من الفكرة؟ يبقى سجل العملية محفوظًا.",
                              )
                            )
                              void run(
                                () => store.removeQuotation(idea.id, q.id),
                                "حُذف عرض السعر.",
                              );
                          }}
                          className="mt-3 !text-[var(--danger)]"
                        >
                          حذف عرض السعر
                        </ActionButton>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {tab === "presentation" && (
              <div className="space-y-4">
                <PresentationPreview idea={idea} data={data} />
                <p className="text-xs text-[var(--soft)]">
                  يُنشأ العرض تلقائيًا من أحدث تفاصيل الفكرة والنص والخطة
                  والعروض. تتضمن حزمة الاعتماد الملفات الأصلية لعرضها ومشاركتها.
                </p>
              </div>
            )}
            {tab === "files" && (
              <div className="space-y-6">
                <section>
                  <h2 className="mb-4">النسخ النهائية حسب قناة النشر</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {idea.channels.map((c) => {
                      const finals = idea.attachments.filter(
                        (a) => a.kind === "final" && a.channel === c,
                      );
                      return (
                        <div
                          key={c}
                          className="rounded-xl border border-[var(--border)] p-4"
                        >
                          <Channels channels={[c]} labels />
                          <span
                            className={`mt-3 block text-xs ${finals.length ? "text-[var(--success)]" : "text-[var(--warning)]"}`}
                          >
                            {finals.length
                              ? `${finals.length} نسخ محفوظة`
                              : "لم تُرفق النسخة النهائية"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
                <div className="space-y-3">
                  {idea.attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--background)] p-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="rounded-lg bg-white p-2 text-[var(--primary)]">
                          <Icon name="file" />
                        </span>
                        <div className="min-w-0">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-sm font-medium break-all underline decoration-[#c9c3dd] underline-offset-4"
                          >
                            <bdi>{file.name}</bdi>
                          </a>
                          <span className="mt-1 block text-xs text-[var(--soft)]">
                            <bdi>{bytes(file.size)}</bdi> ·{" "}
                            {file.kind === "brief"
                              ? "مرجع الفكرة"
                              : file.kind === "quotation"
                                ? "عرض سعر"
                                : "نسخة نهائية"}
                            {file.channel &&
                              ` · ${CHANNEL_LABELS[file.channel]}`}
                          </span>
                        </div>
                      </div>
                      <a
                        aria-label={`تنزيل ${file.name}`}
                        href={file.url}
                        download
                        className="rounded-lg bg-white p-2.5 text-[var(--soft)]"
                      >
                        <Icon name="download" className="size-4" />
                      </a>
                      {((canEdit && file.kind !== "final") ||
                        (canDesign &&
                          designStage &&
                          file.kind === "final")) && (
                        <ActionButton
                          aria-label={`حذف ${file.name}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                "إزالة المرفق من الفكرة؟ تبقى النسخة الأصلية محفوظة على الخادم.",
                              )
                            )
                              void run(
                                () => store.removeAttachment(idea.id, file.id),
                                "أُزيل المرفق من الفكرة.",
                              );
                          }}
                          className="size-9 px-0 !text-[var(--danger)]"
                        >
                          <Icon name="close" className="size-4" />
                        </ActionButton>
                      )}
                    </div>
                  ))}
                </div>
                {idea.status === "delivered" && (
                  <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
                    <h2 className="!text-base">الأرشفة في Google Drive</h2>
                    <p className="text-sm text-[var(--soft)]">
                      {ARCHIVE_TEXT[idea.archive?.status || "not_started"]}
                      {idea.archive?.archivedAt ? ` · ${formatDate(idea.archive.archivedAt)}` : ""}
                    </p>
                    {admin && idea.archive?.folderUrl && (
                      <a className="text-sm text-[var(--primary)] underline underline-offset-4" href={idea.archive.folderUrl} target="_blank" rel="noopener noreferrer">
                        فتح مجلد المشروع في Drive
                      </a>
                    )}
                    {admin && ["failed", "needs_review", "not_started"].includes(idea.archive?.status || "not_started") && (
                      <ActionButton
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await postJson("/api/integrations/google", { action: "retryArchive", ideaId: idea.id });
                            await useMediaStore.getState().refresh();
                          }, "أُعيدت محاولة الأرشفة.")
                        }
                      >
                        <Icon name="refresh" className="size-4" />
                        إعادة محاولة الأرشفة
                      </ActionButton>
                    )}
                  </section>
                )}
                {(canEdit ||
                  (canDesign &&
                    ["scheduled", "designing", "design_review"].includes(idea.status))) && (
                  <form
                    onSubmit={upload}
                    className="space-y-4 rounded-xl border border-dashed border-[var(--input)] p-5"
                  >
                    <h2 className="!text-base">إضافة مرفقات</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="media-label">
                        نوع المرفق
                        <select
                          className="media-input mt-2"
                          value={canEdit ? kind : "final"}
                          onChange={(e) =>
                            setKind(e.target.value as Attachment["kind"])
                          }
                          disabled={!canEdit}
                        >
                          {canEdit && (
                            <>
                              <option value="brief">مرجع الفكرة</option>
                              <option value="quotation">عرض سعر</option>
                            </>
                          )}
                          {!canEdit && (
                            <option value="final">نسخة نهائية للأرشفة</option>
                          )}
                        </select>
                      </label>
                      {(!canEdit || kind === "final") && (
                        <label className="media-label">
                          قناة النسخة النهائية
                          <select
                            className="media-input mt-2"
                            value={channel}
                            onChange={(e) =>
                              setChannel(e.target.value as Channel)
                            }
                          >
                            {idea.channels.map((c) => (
                              <option key={c} value={c}>
                                {CHANNEL_LABELS[c]} ·{" "}
                                {c === "screens"
                                  ? "16:9"
                                  : c === "whatsapp"
                                    ? "9:16"
                                    : "بريد"}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <label className="media-label">
                      اختر الملفات
                      <input
                        type="file"
                        required
                        multiple
                        className="media-input mt-2"
                        onChange={(e) => {
                          setUploading(Array.from(e.target.files || []));
                          setPendingUpload([]);
                          if (!canEdit) setKind("final");
                        }}
                      />
                    </label>
                    <p className="text-xs text-[var(--soft)]">
                      جميع أنواع الملفات · حتى 25 MB للملف. أرفق نسخة نهائية لكل
                      قناة مطلوبة قبل التسليم.
                    </p>
                    <ActionButton type="submit" disabled={busy}>
                      <Icon name="upload" className="size-4" />
                      {busy ? "جارٍ رفع الملفات…" : "رفع الملفات وحفظها"}
                    </ActionButton>
                  </form>
                )}
              </div>
            )}
            {tab === "activity" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  {[...idea.history].reverse().map((event) => (
                    <div key={event.id} className="flex items-start gap-3">
                      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--primary)]">
                        <Icon
                          name={
                            event.action === "approved"
                              ? "check"
                              : event.action === "delivered"
                                ? "archive"
                                : "clock"
                          }
                          className="size-4"
                        />
                      </span>
                      <div className="flex-1 rounded-xl bg-[var(--background)] px-4 py-3">
                        <p className="whitespace-pre-wrap">{event.note}</p>
                        <span className="mt-2 block text-xs text-[var(--soft)]">
                          {
                            data.members.find((m) => m.id === event.actorId)
                              ?.name
                          }{" "}
                          · {formatDate(event.at)} ·{" "}
                          <bdi>
                            {new Date(event.at).toLocaleTimeString("ar-SA", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Riyadh",
                            })}
                          </bdi>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {(admin ||
                  currentUser?.role === "manager" ||
                  idea.ownerId === currentUser?.id ||
                  idea.designerId === currentUser?.id) && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await store.addComment(idea.id, comment);
                        setComment("");
                      }, "أُضيف التعليق إلى سجل العمل.");
                    }}
                    className="space-y-3"
                  >
                    <label className="media-label">
                      إضافة تعليق للفريق
                      <textarea
                        rows={3}
                        required
                        maxLength={3000}
                        className="media-input mt-2"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="ملاحظة أو تحديث يتعلق بتنفيذ الفكرة…"
                      />
                    </label>
                    <ActionButton type="submit" disabled={busy}>
                      إضافة التعليق
                    </ActionButton>
                  </form>
                )}
              </div>
            )}
          </div>
          {canDesign && ["approved", "scheduled"].includes(idea.status) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await store.scheduleIdea(
                    idea.id,
                    {
                      designerId: designer,
                      scheduledAt: scheduled,
                      dueDate: due,
                      priority,
                    },
                    scheduleBaseline,
                  );
                  const saved = useMediaStore.getState().data.ideas.find((item) => item.id === idea.id)!;
                  setScheduleBaseline({ designerId: saved.designerId, scheduledAt: saved.scheduledAt, dueDate: saved.dueDate, priority: saved.priority });
                }, "جُدول العمل وأُرسل إشعار للمصمم.");
              }}
              className="space-y-4 rounded-xl border border-[#c9bfec] bg-[#f8f6ff] p-5"
            >
              <h2 className="!text-base">جدولة التنفيذ وإسناد التصميم</h2>
              {(["designerId", "scheduledAt", "dueDate", "priority"] as const).some((key) => scheduleBaseline[key] !== idea[key]) && (
                <div className="rounded-xl bg-[#fff1dc] p-3 text-xs text-[var(--warning)]">
                  تحدّثت بيانات العمل منذ فتحه. حمّل أحدث الجدولة قبل الحفظ.
                  <ActionButton
                    className="mt-2 !text-xs"
                    onClick={() => {
                      setDesigner(defaultDesigner());
                      setScheduled(idea.scheduledAt || today());
                      setDue(idea.dueDate);
                      setPriority(idea.priority);
                      setScheduleBaseline({ designerId: idea.designerId, scheduledAt: idea.scheduledAt, dueDate: idea.dueDate, priority: idea.priority });
                    }}
                  >
                    تحميل أحدث بيانات الجدولة
                  </ActionButton>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="media-label">
                  المصمم المسؤول
                  <select
                    required
                    className="media-input mt-2"
                    value={designer}
                    onChange={(e) => setDesigner(e.target.value)}
                  >
                    {data.members
                      .filter(
                        (m) =>
                          m.role === "designer" &&
                          m.active &&
                          (admin || m.id === currentUser?.id),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="media-label">
                  الأولوية
                  <select
                    className="media-input mt-2"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="media-label">
                  بداية التنفيذ
                  <input
                    type="date"
                    required
                    min={idea.requestedAt}
                    className="media-input mt-2"
                    value={scheduled}
                    onChange={(e) => setScheduled(e.target.value)}
                  />
                </label>
                <label className="media-label">
                  موعد التسليم
                  <input
                    type="date"
                    required
                    min={scheduled}
                    className="media-input mt-2"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
              </div>
              <ActionButton type="submit" disabled={busy}>
                <Icon name="calendar" className="size-4" />
                حفظ الجدولة
              </ActionButton>
            </form>
          )}
          {message && (
            <div
              role="status"
              className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm"
            >
              {message}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white px-5 py-4">
          <span className="text-xs text-[var(--soft)]">
            آخر تحديث: {formatDate(idea.updatedAt)}
          </span>
          <div className="flex flex-wrap gap-3">
            {canDeleteIdea(idea, currentUser) && (
              <ActionButton className="!text-[var(--danger)]" disabled={busy} onClick={() => setLifecycle({ kind: "delete", text: "" })}>حذف الفكرة</ActionButton>
            )}
            {canCancelIdea(idea, currentUser) && (
              <ActionButton disabled={busy} onClick={() => setLifecycle({ kind: "cancel", text: "" })}>إلغاء الفكرة</ActionButton>
            )}
            {canReopenIdea(idea, currentUser) && (
              <ActionButton disabled={busy} onClick={() => setLifecycle({ kind: "reopen", text: "" })}>إعادة فتح</ActionButton>
            )}
            {admin && !["delivered", "cancelled", "rejected"].includes(idea.status) && (
              <ActionButton disabled={busy} onClick={() => setReassign({ ownerId: idea.ownerId, designerId: idea.designerId })}>إعادة الإسناد</ActionButton>
            )}
            {canWithdrawIdea(idea, currentUser) && (
              <ActionButton disabled={busy} onClick={() => void run(() => store.withdrawIdea(idea.id), "سُحبت الفكرة من الاعتماد. عدّلها ثم أعد إرسالها.")}>سحب من الاعتماد</ActionButton>
            )}
            {(admin || currentUser?.role === "manager") && idea.status === "review" && idea.ownerId === currentUser?.id && (
              <span className="text-xs text-[var(--soft)]">يعتمد هذه الفكرة مدير آخر لأنك صاحبها.</span>
            )}
            {canEdit && (
              <ActionButton
                primary
                disabled={busy}
                onClick={() =>
                  void run(
                    () => store.submitIdea(idea.id),
                    "أُرسلت الفكرة مع عرضها إلى المدير للمراجعة.",
                  )
                }
              >
                <Icon name="check" className="size-4" />
                {idea.status === "changes"
                  ? "إعادة الإرسال للاعتماد"
                  : "إرسال للاعتماد"}
              </ActionButton>
            )}
            {canReview && (
              <>
                <ActionButton className="!text-[var(--danger)]" onClick={() => setLifecycle({ kind: "reject", text: "" })} disabled={busy}>
                  رفض نهائي
                </ActionButton>
                <ActionButton
                  onClick={() => setReturnDialog(true)}
                  disabled={busy}
                >
                  إعادة للتعديل
                </ActionButton>
                <ActionButton
                  primary
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        store.reviewIdea(idea.id, "approved", ""),
                      "اعتُمدت الفكرة وانتقلت تلقائيًا إلى استوديو التصميم.",
                    )
                  }
                >
                  <Icon name="check" className="size-4" />
                  اعتماد الفكرة
                </ActionButton>
              </>
            )}
            {canDesign && idea.status === "scheduled" && (
              <ActionButton
                primary
                disabled={busy}
                onClick={() =>
                  void run(
                    () => store.changeDesignStatus(idea.id, "designing"),
                    "بدأ تنفيذ التصميم.",
                  )
                }
              >
                بدء التصميم
              </ActionButton>
            )}
            {canDesign && idea.status === "designing" && (
              <ActionButton
                primary
                disabled={busy}
                onClick={() =>
                  void run(
                    () => store.changeDesignStatus(idea.id, "design_review"),
                    "انتقل العمل إلى مراجعة التصميم.",
                  )
                }
              >
                إرسال التصميم للمراجعة
              </ActionButton>
            )}
            {canDesign && idea.status === "design_review" && (
              <>
                <ActionButton
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => store.changeDesignStatus(idea.id, "designing"),
                      "أُعيد العمل إلى التصميم.",
                    )
                  }
                >
                  استكمال التصميم
                </ActionButton>
                <ActionButton
                  primary
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => store.changeDesignStatus(idea.id, "delivered"),
                      "تم التسليم وأُضيف العمل إلى التقرير الشهري. ستتم أرشفته في Google Drive تلقائياً.",
                    )
                  }
                >
                  <Icon name="archive" className="size-4" />
                  تسجيل التسليم النهائي
                </ActionButton>
              </>
            )}
            {idea.status === "delivered" && (
              <span className="media-badge media-badge-success">
                سُلّم · يظهر في تقرير{" "}
                {formatDate(idea.deliveredAt, {
                  month: "long",
                  year: "numeric",
                  day: undefined,
                })}
              </span>
            )}
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(lifecycle)}
        onClose={() => setLifecycle(null)}
        locked={busy}
        title={lifecycle ? LIFECYCLE[lifecycle.kind].title : ""}
        description={lifecycle ? LIFECYCLE[lifecycle.kind].description : ""}
      >
        {lifecycle && (
          <form
            className="space-y-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const text = lifecycle.text;
              void run(async () => {
                if (lifecycle.kind === "reject") await store.reviewIdea(idea.id, "rejected", text);
                if (lifecycle.kind === "cancel") await store.cancelIdea(idea.id, text);
                if (lifecycle.kind === "reopen") await store.reopenIdea(idea.id, text);
                if (lifecycle.kind === "delete") await store.deleteIdea(idea.id, text);
                setLifecycle(null);
              }, LIFECYCLE[lifecycle.kind].done);
            }}
          >
            <label className="media-label">
              {LIFECYCLE[lifecycle.kind].label}
              <textarea className="media-input mt-2" rows={4} autoFocus required={lifecycle.kind !== "delete"} maxLength={4000} value={lifecycle.text} onChange={(e) => setLifecycle({ ...lifecycle, text: e.target.value })} />
            </label>
            <ActionButton type="submit" primary={lifecycle.kind !== "delete"} className={lifecycle.kind === "delete" ? "!text-[var(--danger)]" : ""} disabled={busy}>{LIFECYCLE[lifecycle.kind].action}</ActionButton>
          </form>
        )}
      </Modal>
      <Modal open={Boolean(reassign)} onClose={() => setReassign(null)} locked={busy} title="إعادة إسناد العمل" description="تنقل المسؤولية دون تغيير مرحلة العمل، ويُشعر المكلّف الجديد.">
        {reassign && (
          <form className="space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); void run(async () => { await store.reassignIdea(idea.id, { ownerId: reassign.ownerId, ...(designStage ? { designerId: reassign.designerId } : {}) }); setReassign(null); }, "أُعيد إسناد العمل."); }}>
            <label className="media-label">مسؤول المحتوى
              <select className="media-input mt-2" value={reassign.ownerId} onChange={(e) => setReassign({ ...reassign, ownerId: e.target.value })}>
                {data.members.filter((m) => m.active && ["content", "admin", "superadmin"].includes(m.role)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            {designStage && (
              <label className="media-label">المصمم
                <select className="media-input mt-2" value={reassign.designerId} onChange={(e) => setReassign({ ...reassign, designerId: e.target.value })}>
                  <option value="">بدون مصمم</option>
                  {data.members.filter((m) => m.active && m.role === "designer").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            )}
            <ActionButton type="submit" primary disabled={busy}>حفظ الإسناد</ActionButton>
          </form>
        )}
      </Modal>
      <Modal
        open={returnDialog}
        onClose={() => setReturnDialog(false)}
        locked={busy}
        title="إعادة الفكرة للتعديل"
        description="تظهر الملاحظة لمسؤول المحتوى حتى يعالجها ويعيد إرسال الفكرة."
      >
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await store.reviewIdea(idea.id, "changes", feedback);
              setReturnDialog(false);
            }, "أُعيدت الفكرة للتعديل وأُشعر مسؤول المحتوى.");
          }}
        >
          <label className="media-label">
            ملاحظة المدير
            <textarea
              className="media-input mt-2"
              rows={5}
              autoFocus
              required
              minLength={5}
              maxLength={4000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="ما الذي يحتاج تعديلًا أو توضيحًا قبل الاعتماد؟"
            />
          </label>
          <ActionButton type="submit" primary disabled={busy}>
            إرسال الملاحظة وإعادة الفكرة
          </ActionButton>
        </form>
      </Modal>
      <Modal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        locked={busy}
        title="إضافة عرض سعر"
        description="بيانات المورد والعرض وملفه الأصلي للمقارنة والاعتماد."
      >
        <form className="space-y-4 p-6" onSubmit={addQuote}>
          <label className="media-label">
            اسم المورد
            <input
              className="media-input mt-2"
              required
              maxLength={150}
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </label>
          <label className="media-label">
            نطاق العمل
            <textarea
              className="media-input mt-2"
              required
              rows={3}
              maxLength={4000}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="media-label">
              قيمة العرض بالريال
              <input
                className="media-input mt-2"
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="media-label">
              مدة التنفيذ بالأيام
              <input
                className="media-input mt-2"
                type="number"
                required
                min="1"
                max="3650"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
          </div>
          <label className="media-label">
            ملف عرض السعر
            <input
              className="media-input mt-2"
              type="file"
              required
              onChange={(e) => {
                setQuoteFile(e.target.files?.[0] || null);
                setPendingQuoteAttachment(null);
              }}
            />
          </label>
          <label className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              checked={recommended}
              onChange={(e) => setRecommended(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            التوصية بهذا العرض
          </label>
          {message && (
            <p role="status" className="text-[var(--danger)]">
              {message}
            </p>
          )}
          <ActionButton type="submit" primary disabled={busy}>
            {busy ? "جارٍ رفع العرض…" : "حفظ عرض السعر"}
          </ActionButton>
        </form>
      </Modal>
    </>
  );
}

"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  type Attachment,
  type Channel,
  type Idea,
} from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import {
  Modal,
  TabList,
  errorText,
  today,
} from "./ui";
import { uploadFiles } from "./idea-editor";
import { PresentationPreview } from "./presentation";
import { isAdministrator } from "@/lib/media-workflow";
import { IdeaSummary } from "./idea-detail/summary";
import { ContentTab, OverviewTab } from "./idea-detail/overview-tab";
import { QuotationsTab } from "./idea-detail/quotations-tab";
import { FilesTab } from "./idea-detail/files-tab";
import { HistoryTab } from "./idea-detail/history-tab";
import { ScheduleForm } from "./idea-detail/schedule-form";
import { ActionsBar } from "./idea-detail/actions-bar";
import { LifecycleDialog, ReassignDialog, ReturnDialog } from "./idea-detail/dialogs";
import { QuoteDialog } from "./idea-detail/quote-dialog";

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
          <IdeaSummary idea={idea} data={data} canEdit={canEdit} onEdit={onEdit} />
          <div className="border-b border-[var(--border)] pb-3">
            <TabList label="تفاصيل الفكرة" idPrefix="idea" compact value={tab} onChange={setTab} items={tabs} />
          </div>
          <div role="tabpanel" id="idea-panel" aria-labelledby={`idea-tab-${tab}`}>
            {tab === "overview" && (
              <OverviewTab idea={idea} data={data} setTab={setTab} />
            )}
            {tab === "content" && (
              <ContentTab idea={idea} />
            )}
            {tab === "quotations" && (
              <QuotationsTab
                idea={idea}
                canEdit={canEdit}
                setQuoteOpen={setQuoteOpen}
                run={run}
                store={store}
              />
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
              <FilesTab
                idea={idea}
                admin={admin}
                canEdit={canEdit}
                canDesign={canDesign}
                designStage={designStage}
                busy={busy}
                run={run}
                store={store}
                upload={upload}
                kind={kind}
                setKind={setKind}
                channel={channel}
                setChannel={setChannel}
                setUploading={setUploading}
                setPendingUpload={setPendingUpload}
              />
            )}
            {tab === "activity" && (
              <HistoryTab
                idea={idea}
                data={data}
                admin={admin}
                currentUser={currentUser}
                busy={busy}
                run={run}
                store={store}
                comment={comment}
                setComment={setComment}
              />
            )}
          </div>
          {canDesign && ["approved", "scheduled"].includes(idea.status) && (
            <ScheduleForm
              idea={idea}
              data={data}
              admin={admin}
              currentUser={currentUser}
              busy={busy}
              run={run}
              store={store}
              designer={designer}
              setDesigner={setDesigner}
              scheduled={scheduled}
              setScheduled={setScheduled}
              due={due}
              setDue={setDue}
              priority={priority}
              setPriority={setPriority}
              scheduleBaseline={scheduleBaseline}
              setScheduleBaseline={setScheduleBaseline}
              defaultDesigner={defaultDesigner}
            />
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
        <ActionsBar
          idea={idea}
          currentUser={currentUser}
          admin={admin}
          busy={busy}
          run={run}
          store={store}
          canEdit={canEdit}
          canReview={canReview}
          canDesign={canDesign}
          setLifecycle={setLifecycle}
          setReassign={setReassign}
          setReturnDialog={setReturnDialog}
        />
      </Modal>
      <LifecycleDialog
        idea={idea}
        busy={busy}
        run={run}
        store={store}
        lifecycle={lifecycle}
        setLifecycle={setLifecycle}
      />
      <ReassignDialog
        idea={idea}
        data={data}
        designStage={designStage}
        busy={busy}
        run={run}
        store={store}
        reassign={reassign}
        setReassign={setReassign}
      />
      <ReturnDialog
        idea={idea}
        busy={busy}
        run={run}
        store={store}
        returnDialog={returnDialog}
        setReturnDialog={setReturnDialog}
        feedback={feedback}
        setFeedback={setFeedback}
      />
      <QuoteDialog
        quoteOpen={quoteOpen}
        setQuoteOpen={setQuoteOpen}
        busy={busy}
        addQuote={addQuote}
        message={message}
        vendor={vendor}
        setVendor={setVendor}
        scope={scope}
        setScope={setScope}
        amount={amount}
        setAmount={setAmount}
        days={days}
        setDays={setDays}
        recommended={recommended}
        setRecommended={setRecommended}
        setQuoteFile={setQuoteFile}
        setPendingQuoteAttachment={setPendingQuoteAttachment}
      />
    </>
  );
}

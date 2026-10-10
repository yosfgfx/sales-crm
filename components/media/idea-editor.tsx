"use client";

import { useState, type FormEvent } from "react";
import {
  CHANNEL_LABELS,
  type Attachment,
  type Channel,
  type Idea,
  type NewIdeaInput,
} from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Icon, Modal, bytes, errorText, today } from "./ui";
import { isAdministrator } from "@/lib/media-workflow";
import { RequestSection } from "./idea-editor/request-section";
import { CoordinationSection } from "./idea-editor/coordination-section";


import { uploadFiles } from "@/lib/upload-client";

export { uploadFiles };

export default function IdeaEditor({
  open,
  idea,
  onClose,
  onSaved,
}: {
  open: boolean;
  idea?: Idea;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const store = useMediaStore();
  const [locked, setLocked] = useState(false);
  const initial: NewIdeaInput = {
    title: idea?.title || "",
    companyId: idea?.companyId || store.data.companies.find((c) => c.active !== false)?.id || "",
    department: idea?.department || "",
    categoryId: idea?.categoryId || store.data.categories.find((c) => c.active !== false)?.id || "",
    workType: idea?.workType || "design",
    description: idea?.description || "",
    content: idea?.content || "",
    executionPlan: idea?.executionPlan || "",
    channels: idea?.channels || ["screens", "whatsapp", "email"],
    ownerId:
      idea?.ownerId ||
      (store.currentUser?.role === "content" ||
      isAdministrator(store.currentUser)
        ? store.currentUser!.id
        : store.data.members.find((m) => m.role === "content")?.id) ||
      "",
    requestedAt: idea?.requestedAt || today(),
    dueDate: idea?.dueDate || today(),
    priority: idea?.priority || "normal",
    needsQuotes: idea?.needsQuotes || false,
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={locked}
      wide
      title={idea ? "تعديل الفكرة" : "فكرة جديدة"}
      description="وضّح الفكرة والنص وخطة التنفيذ؛ يتكوّن عرض الاعتماد تلقائيًا من هذه البيانات."
    >
      {open && (
        <EditorForm
          key={idea?.id || "new"}
          initial={initial}
          idea={idea}
          onClose={onClose}
          onSaved={onSaved}
          onBusy={setLocked}
        />
      )}
    </Modal>
  );
}

function EditorForm({
  initial,
  idea,
  onClose,
  onSaved,
  onBusy,
}: {
  initial: NewIdeaInput;
  idea?: Idea;
  onClose: () => void;
  onSaved: (id: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const store = useMediaStore();
  const [form, setForm] = useState(initial),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [createdId, setCreatedId] = useState<string | undefined>(idea?.id),
    [expectedUpdatedAt, setExpectedUpdatedAt] = useState(idea?.updatedAt),
    [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const update = <K extends keyof NewIdeaInput>(
    key: K,
    value: NewIdeaInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.channels.length) {
      setError("اختر قناة نشر واحدة على الأقل.");
      return;
    }
    if (form.dueDate < form.requestedAt) {
      setError("اختر موعد تسليم يساوي تاريخ الطلب أو يأتي بعده.");
      return;
    }
    setBusy(true);
    onBusy(true);
    setError("");
    let savedId = createdId;
    try {
      if (savedId) await store.patchIdea(savedId, form, expectedUpdatedAt);
      else {
        const saved = await store.createIdea(form);
        savedId = saved.id;
        setCreatedId(saved.id);
      }
      setExpectedUpdatedAt(
        useMediaStore.getState().data.ideas.find((item) => item.id === savedId)
          ?.updatedAt,
      );
      if (files.length && savedId) {
        const attachments = pendingAttachments.length
          ? pendingAttachments
          : await uploadFiles(files, savedId, "brief");
        setPendingAttachments(attachments);
        const latest = useMediaStore
          .getState()
          .data.ideas.find((item) => item.id === savedId)!;
        const missing = attachments.filter(
          (file) => !latest.attachments.some((stored) => stored.id === file.id),
        );
        if (missing.length) await store.addAttachments(savedId, missing);
        setPendingAttachments([]);
        setFiles([]);
        setExpectedUpdatedAt(
          useMediaStore
            .getState()
            .data.ideas.find((item) => item.id === savedId)?.updatedAt,
        );
      }
      if (savedId) onSaved(savedId);
    } catch (err) {
      setError(
        errorText(err) +
          (savedId && !idea
            ? " حُفظت الفكرة؛ افتحها لاستكمال رفع الملفات."
            : ""),
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="contents">
        <div className="space-y-6 p-5 sm:p-6">
          {idea?.sourceProposal && (
            <p className="rounded-xl bg-[var(--accent)] p-4 text-sm text-[var(--primary)]">
              مقدم الفكرة: <strong>{idea.sourceProposal.proposerName}</strong>.
              يبقى الإسناد محفوظًا أثناء تعديل النص وخطة التنفيذ.
            </p>
          )}
          {idea?.managerFeedback && (
            <div className="rounded-xl bg-[#fff1dc] p-4">
              <span className="font-bold text-[var(--warning)]">
                ملاحظة المدير
              </span>
              <p className="mt-2 text-[var(--warning)]">
                {idea.managerFeedback}
              </p>
            </div>
          )}
          <RequestSection form={form} update={update} store={store} />
          <section className="space-y-4 border-t border-[var(--border)] pt-6">
            <h2>الفكرة والمحتوى</h2>
            <label className="media-label">
              وصف دقيق للفكرة والهدف منها
              <textarea
                required
                name="description"
                rows={4}
                maxLength={12000}
                className="media-input mt-2 resize-y"
                value={form.description}
                placeholder="ما الرسالة؟ من الجمهور؟ ما النتيجة التي تريد الوصول إليها؟"
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
            <label className="media-label">
              نص المحتوى
              <textarea
                required
                name="content"
                rows={4}
                maxLength={20000}
                className="media-input mt-2 resize-y"
                value={form.content}
                placeholder="النص الذي سيظهر على الشاشة أو في الرسالة، أو سيناريو الفيديو."
                onChange={(e) => update("content", e.target.value)}
              />
            </label>
            <label className="media-label">
              طريقة التنفيذ
              <textarea
                required
                name="executionPlan"
                rows={3}
                maxLength={12000}
                className="media-input mt-2 resize-y"
                value={form.executionPlan}
                placeholder="خطوات التنفيذ، الموارد المطلوبة، والمخرجات المتوقعة."
                onChange={(e) => update("executionPlan", e.target.value)}
              />
            </label>
            <fieldset>
              <legend className="media-label">
                قنوات النشر والمخرجات المطلوبة
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(CHANNEL_LABELS).map(([id, label]) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${form.channels.includes(id as Channel) ? "border-[#a99beb] bg-[var(--accent)]" : "border-[var(--border)]"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={form.channels.includes(id as Channel)}
                      onChange={(e) =>
                        update(
                          "channels",
                          e.target.checked
                            ? [...form.channels, id as Channel]
                            : form.channels.filter((c) => c !== id),
                        )
                      }
                    />
                    <span>
                      <span className="block text-sm">{label}</span>
                      <span className="text-xs text-[var(--soft)]">
                        {id === "screens"
                          ? "أفقي 16:9"
                          : id === "whatsapp"
                            ? "عمودي 9:16"
                            : "نسخة مناسبة للبريد"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <CoordinationSection form={form} update={update} store={store} />
          <section className="space-y-3 border-t border-[var(--border)] pt-6">
            <h2>مرفقات الفكرة</h2>
            <label className="block cursor-pointer rounded-xl border border-dashed border-[#c6bcdf] bg-[var(--background)] p-6 text-center">
              <Icon
                name="upload"
                className="mx-auto mb-3 size-6 text-[var(--primary)]"
              />
              <span className="block text-sm font-medium">
                اختر صورًا أو ملفات تدعم الفكرة
              </span>
              <span className="mt-1 block text-xs text-[var(--soft)]">
                جميع أنواع الملفات · حتى 25 MB للملف
              </span>
              <input
                className="media-input mt-4 !bg-white"
                type="file"
                multiple
                aria-label="إرفاق ملفات الفكرة"
                onChange={(e) => {
                  setFiles(Array.from(e.target.files || []));
                  setPendingAttachments([]);
                }}
              />
            </label>
            {files.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-[var(--background)] px-3 py-2"
              >
                <span className="min-w-0 text-xs break-all">
                  <bdi>{file.name}</bdi> · <bdi>{bytes(file.size)}</bdi>
                </span>
                <ActionButton
                  aria-label={`إزالة ${file.name}`}
                  onClick={() =>
                    setFiles(files.filter((_, index) => index !== i))
                  }
                  className="size-8 px-0"
                >
                  <Icon name="close" className="size-3.5" />
                </ActionButton>
              </div>
            ))}
          </section>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[#fff0f1] p-4 text-[var(--danger)]"
            >
              {error}
            </p>
          )}
        </div>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-[var(--border)] bg-white px-6 py-4">
          <ActionButton onClick={onClose} disabled={busy}>
            إلغاء
          </ActionButton>
          <ActionButton type="submit" primary disabled={busy}>
            <Icon name="check" className="size-4" />
            {busy
              ? "جارٍ الحفظ ورفع الملفات…"
              : idea
                ? "حفظ التعديلات"
                : "حفظ الفكرة واستكمالها"}
          </ActionButton>
        </div>
      </fieldset>
    </form>
  );
}

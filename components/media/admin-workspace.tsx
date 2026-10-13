"use client";

import { useMemo, useState } from "react";
import { STATUS_LABELS, WORK_TYPE_LABELS, ideaCompanyLabel, ideaHasCompany } from "@/data/media";
import { useMediaStore } from "@/stores/media-store";
import { isAdministrator } from "@/lib/media-workflow";
import {
  ActionButton,
  EmptyState,
  Icon,
  Modal,
  StatusBadge,
  errorText,
  formatCount,
  formatDate,
} from "./ui";

export default function AdminWorkspace({
  onOpenIdea,
  onEditIdea,
  onCreateIdea,
}: {
  onOpenIdea: (id: string) => void;
  onEditIdea: (id: string) => void;
  onCreateIdea: () => void;
}) {
  const store = useMediaStore();
  const [mode, setMode] = useState<"work" | "deleted">("work");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState<
    string[] | null
  >(null);
  const [assignments, setAssignments] = useState<
    Record<string, { ownerId: string; designerId: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const ideas = useMemo(
    () =>
      store.data.ideas.filter((idea) => {
        if (Boolean(idea.deletedAt) !== (mode === "deleted")) return false;
        if (company !== "all" && !ideaHasCompany(idea, company)) return false;
        if (status !== "all" && idea.status !== status) return false;
        const terms = [
          idea.title,
          idea.code,
          idea.department,
          idea.sourceProposal?.proposerName,
          ideaCompanyLabel(idea, store.data.companies),
        ]
          .join(" ")
          .normalize("NFKD")
          .replace(/[\u064B-\u065F]/g, "")
          .toLowerCase();
        return terms.includes(
          query
            .normalize("NFKD")
            .replace(/[\u064B-\u065F]/g, "")
            .trim()
            .toLowerCase(),
        );
      }),
    [store.data.ideas, store.data.companies, query, company, status, mode],
  );
  const visible = ideas.slice(0, limit);
  const activeCount = store.data.ideas.filter((idea) => !idea.deletedAt).length;
  const deletedCount = store.data.ideas.filter((idea) => idea.deletedAt).length;
  if (!isAdministrator(store.currentUser)) return null;

  function requestRestore(ids: string[]) {
    setAssignments({});
    setError("");
    setRestoreConfirmation(ids);
  }

  async function restore(ids: string[]) {
    setBusy(true);
    setError("");
    setMessage("");
    let restored = 0;
    try {
      for (const id of ids) {
        if (
          !useMediaStore.getState().data.ideas.find((idea) => idea.id === id)
            ?.deletedAt
        )
          continue;
        await useMediaStore
          .getState()
          .restoreIdea(id, {
            ...(assignments[id]?.ownerId
              ? { ownerId: assignments[id].ownerId }
              : {}),
            ...(assignments[id]?.designerId
              ? { designerId: assignments[id].designerId }
              : {}),
          });
        restored += 1;
        setSelected((previous) => previous.filter((item) => item !== id));
      }
      setMessage(
        `استُعيد ${formatCount(restored)} من الأعمال بجميع تفاصيلها ومرفقاتها.`,
      );
      setRestoreConfirmation(null);
    } catch (cause) {
      setError(
        `${restored ? `استُعيد ${formatCount(restored)} من الأعمال. ` : ""}${errorText(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="media-card flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2>تحرير لوحة العمل</h2>
          <p className="mt-2 max-w-[50em] text-sm text-[var(--soft)]">
            أضف الأعمال، وعدّل تفاصيلها وإسنادها، أو انقلها إلى سلة المحذوفات.
            تبقى الملفات والسجل محفوظين عند الحذف، وتعود مع الاستعادة.
          </p>
          <p className="mt-2 max-w-[50em] text-xs text-[var(--soft)]">
            تغيير المحتوى أو قنوات النشر في عمل معتمد يعيده إلى المراجعة؛ تبقى
            المخرجات السابقة محفوظة.
          </p>
        </div>
        <ActionButton primary onClick={onCreateIdea}>
          <Icon name="plus" />
          إضافة عمل
        </ActionButton>
      </div>
      <div
        className="flex flex-wrap gap-2"
        aria-label="عرض الأعمال أو المحذوفات"
      >
        <ActionButton
          aria-pressed={mode === "work"}
          onClick={() => {
            setMode("work");
            setSelected([]);
            setLimit(50);
          }}
          className={
            mode === "work" ? "!bg-[var(--accent)] !text-[var(--primary)]" : ""
          }
        >
          لوحة العمل <span>{formatCount(activeCount)}</span>
        </ActionButton>
        <ActionButton
          aria-pressed={mode === "deleted"}
          onClick={() => {
            setMode("deleted");
            setSelected([]);
            setLimit(50);
          }}
          className={
            mode === "deleted"
              ? "!bg-[var(--accent)] !text-[var(--primary)]"
              : ""
          }
        >
          <Icon name="trash" className="size-4" />
          سلة المحذوفات <span>{formatCount(deletedCount)}</span>
        </ActionButton>
      </div>
      <div className="media-card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr]">
          <label className="media-label !mb-0">
            البحث في الأعمال
            <input
              type="search"
              className="media-input mt-2"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(50);
              }}
              placeholder="عنوان العمل أو رقمه أو الإدارة"
            />
          </label>
          <label className="media-label !mb-0">
            الشركة
            <select
              className="media-input mt-2"
              value={company}
              onChange={(event) => {
                setCompany(event.target.value);
                setLimit(50);
              }}
            >
              <option value="all">كل الشركات</option>
              {store.data.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="media-label !mb-0">
            حالة العمل
            <select
              className="media-input mt-2"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setLimit(50);
              }}
            >
              <option value="all">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {visible.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={busy}
                checked={visible.every((idea) => selected.includes(idea.id))}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? Array.from(
                          new Set([
                            ...previous,
                            ...visible.map((idea) => idea.id),
                          ]),
                        )
                      : previous.filter(
                          (id) => !visible.some((idea) => idea.id === id),
                        ),
                  )
                }
              />
              تحديد الأعمال المعروضة
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--soft)]">
                المحدد: {formatCount(selected.length)}
              </span>
              {selected.length > 0 &&
                (mode === "deleted" ? (
                  <ActionButton
                    disabled={busy}
                    onClick={() => requestRestore(selected)}
                  >
                    <Icon name="refresh" className="size-4" />
                    استعادة المحدد
                  </ActionButton>
                ) : (
                  <ActionButton
                    disabled={busy}
                    className="!text-[var(--danger)]"
                    onClick={() => {
                      setConfirmation(selected);
                      setReason("");
                      setError("");
                    }}
                  >
                    <Icon name="trash" className="size-4" />
                    نقل المحدد إلى السلة
                  </ActionButton>
                ))}
            </div>
          </div>
        )}
      </div>
      <div role="status" aria-live="polite">
        {message && (
          <p className="rounded-xl bg-[#eff9f3] p-4 text-sm text-[#197254]">
            {message}
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-[#fff0f1] p-4 text-sm text-[var(--danger)]"
        >
          {error}
        </p>
      )}
      {!visible.length ? (
        <EmptyState
          title={
            mode === "deleted"
              ? "لا توجد أعمال في السلة"
              : "لا توجد أعمال مطابقة"
          }
          description="يمكنك تغيير البحث أو عوامل التصفية، أو إضافة عمل جديد إلى اللوحة."
        />
      ) : (
        <div className="media-card divide-y divide-[var(--border)]">
          {visible.map((idea) => (
            <article
              key={idea.id}
              className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-center ${idea.status === "delivered" && !idea.deletedAt ? "bg-[#eff9f3]" : ""}`}
            >
              <label className="flex min-h-10 shrink-0 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(idea.id)}
                  onChange={(event) =>
                    setSelected((previous) =>
                      event.target.checked
                        ? [...previous, idea.id]
                        : previous.filter((id) => id !== idea.id),
                    )
                  }
                />
                <span className="sr-only">تحديد العمل {idea.title}</span>
              </label>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--soft)]">
                  <bdi>{idea.code}</bdi> · {WORK_TYPE_LABELS[idea.workType]}
                </p>
                <h3 className="mt-1 !text-base break-words">{idea.title}</h3>
                <p className="mt-1 text-xs text-[var(--soft)]">
                  {ideaCompanyLabel(idea, store.data.companies)} · {idea.department}
                </p>
                {idea.deletedAt && (
                  <p className="mt-2 text-xs text-[var(--soft)]">
                    نُقل إلى السلة: {formatDate(idea.deletedAt)}
                    {idea.deletionReason ? ` · ${idea.deletionReason}` : ""}
                  </p>
                )}
              </div>
              <StatusBadge status={idea.status} />
              <div className="flex shrink-0 flex-wrap gap-2">
                <ActionButton
                  onClick={() => onOpenIdea(idea.id)}
                  disabled={busy}
                >
                  التفاصيل
                </ActionButton>
                {idea.deletedAt ? (
                  <ActionButton
                    disabled={busy}
                    onClick={() => requestRestore([idea.id])}
                  >
                    <Icon name="refresh" className="size-4" />
                    استعادة
                  </ActionButton>
                ) : (
                  <>
                    <ActionButton
                      disabled={busy}
                      onClick={() => onEditIdea(idea.id)}
                    >
                      <Icon name="design" className="size-4" />
                      تعديل
                    </ActionButton>
                    <ActionButton
                      aria-label={`نقل ${idea.title} إلى سلة المحذوفات`}
                      disabled={busy}
                      className="size-10 !px-0 !text-[var(--danger)]"
                      onClick={() => {
                        setConfirmation([idea.id]);
                        setReason("");
                        setError("");
                      }}
                    >
                      <Icon name="trash" className="size-4" />
                    </ActionButton>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {visible.length < ideas.length && (
        <ActionButton
          onClick={() => setLimit((value) => value + 50)}
          className="w-full"
        >
          عرض أعمال إضافية ({formatCount(visible.length)} من{" "}
          {formatCount(ideas.length)})
        </ActionButton>
      )}
      <Modal
        open={Boolean(restoreConfirmation)}
        locked={busy}
        onClose={() => setRestoreConfirmation(null)}
        title="استعادة الأعمال"
        description="تعود الأعمال بحالتها السابقة وملفاتها وسجلها. يمكنك تحديث الإسناد إذا تغيّر الفريق أثناء وجودها في السلة."
      >
        {restoreConfirmation && (
          <form
            className="space-y-4 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void restore(restoreConfirmation);
            }}
          >
            <div className="max-h-[55dvh] space-y-4 overflow-y-auto">
              {restoreConfirmation.map((id) => {
                const idea = store.data.ideas.find((item) => item.id === id);
                if (!idea?.deletedAt) return null;
                const closed = ["delivered", "cancelled", "rejected"].includes(
                  idea.status,
                );
                const owners = store.data.members.filter(
                  (member) =>
                    member.active &&
                    ["content", "admin", "superadmin"].includes(member.role),
                );
                const designers = store.data.members.filter(
                  (member) => member.active && member.role === "designer",
                );
                const ownerValid = owners.some(
                  (member) => member.id === idea.ownerId,
                );
                const designerValid = designers.some(
                  (member) => member.id === idea.designerId,
                );
                const needsDesigner =
                  Boolean(idea.designerId) ||
                  ["scheduled", "designing", "design_review"].includes(
                    idea.status,
                  );
                return (
                  <fieldset
                    key={id}
                    className="space-y-3 rounded-xl border border-[var(--border)] p-4"
                  >
                    <legend className="max-w-full px-2 text-sm font-semibold break-words">
                      {idea.title}
                    </legend>
                    <label className="media-label">
                      مسؤول المحتوى
                      <select
                        className="media-input mt-2"
                        required={!closed && !ownerValid}
                        value={assignments[id]?.ownerId || ""}
                        onChange={(event) =>
                          setAssignments((previous) => ({
                            ...previous,
                            [id]: {
                              ownerId: event.target.value,
                              designerId: previous[id]?.designerId || "",
                            },
                          }))
                        }
                      >
                        <option value="">
                          {closed || ownerValid
                            ? `الإبقاء على الإسناد السابق · ${store.data.members.find((member) => member.id === idea.ownerId)?.name || "غير محدد"}`
                            : "اختر مسؤول محتوى فعالًا"}
                        </option>
                        {owners.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="media-label">
                      المصمم
                      <select
                        className="media-input mt-2"
                        required={!closed && needsDesigner && !designerValid}
                        value={assignments[id]?.designerId || ""}
                        onChange={(event) =>
                          setAssignments((previous) => ({
                            ...previous,
                            [id]: {
                              ownerId: previous[id]?.ownerId || "",
                              designerId: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="">
                          {closed || designerValid || !needsDesigner
                            ? `الإبقاء على الإسناد السابق · ${store.data.members.find((member) => member.id === idea.designerId)?.name || "بدون مصمم"}`
                            : "اختر مصممًا فعالًا"}
                        </option>
                        {designers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                );
              })}
            </div>
            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                disabled={busy}
                onClick={() => setRestoreConfirmation(null)}
              >
                إلغاء
              </ActionButton>
              <ActionButton primary type="submit" disabled={busy}>
                <Icon name="refresh" className="size-4" />
                {busy ? "جارٍ الاستعادة…" : "استعادة الأعمال"}
              </ActionButton>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={Boolean(confirmation)}
        locked={busy}
        onClose={() => setConfirmation(null)}
        title="نقل الأعمال إلى سلة المحذوفات"
        description="تُخفى الأعمال المختارة من لوحة الفريق، وتبقى قابلة للاستعادة بجميع مرفقاتها وسجلها."
      >
        {confirmation && (
          <form
            className="space-y-4 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              let removed = 0;
              void (async () => {
                try {
                  for (const id of confirmation) {
                    if (
                      useMediaStore
                        .getState()
                        .data.ideas.find((idea) => idea.id === id)?.deletedAt
                    )
                      continue;
                    await useMediaStore.getState().deleteIdea(id, reason);
                    removed += 1;
                    setSelected((previous) =>
                      previous.filter((item) => item !== id),
                    );
                  }
                  setMessage(
                    `نُقل ${formatCount(removed)} من الأعمال إلى السلة.`,
                  );
                  setConfirmation(null);
                } catch (cause) {
                  setError(
                    `${removed ? `نُقل ${formatCount(removed)} من الأعمال. ` : ""}${errorText(cause)}`,
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <ul className="max-h-44 space-y-2 overflow-y-auto rounded-xl bg-[var(--background)] p-4 text-sm">
              {confirmation.map((id) => (
                <li key={id}>
                  {store.data.ideas.find((idea) => idea.id === id)?.title || id}
                </li>
              ))}
            </ul>
            <label className="media-label">
              سبب الحذف (اختياري)
              <textarea
                className="media-input mt-2"
                rows={3}
                maxLength={4000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                إلغاء
              </ActionButton>
              <ActionButton
                type="submit"
                disabled={busy}
                className="!text-[var(--danger)]"
              >
                <Icon name="trash" className="size-4" />
                {busy ? "جارٍ النقل…" : "تأكيد النقل إلى السلة"}
              </ActionButton>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

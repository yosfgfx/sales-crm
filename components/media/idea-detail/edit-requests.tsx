"use client";

import { useState } from "react";
import type { EditRequest, Idea, MediaData, TeamMember } from "@/data/media";
import { canDecideIdeaEditOn, canRequestIdeaEdit } from "@/lib/media-workflow";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Icon, errorText, formatDate } from "../ui";
import { Avatar } from "../workspace/avatar";

const STATUS: Record<EditRequest["status"], { label: string; className: string }> = {
  pending: { label: "بانتظار الموافقة", className: "media-badge media-badge-accent" },
  approved: { label: "تمت الموافقة", className: "media-badge media-badge-success" },
  rejected: { label: "لم يُوافَق عليه", className: "media-badge" },
};

export function EditRequestsPanel({
  idea,
  data,
  currentUser,
}: {
  idea: Idea;
  data: MediaData;
  currentUser: TeamMember | null;
}) {
  const store = useMediaStore();
  const [composing, setComposing] = useState(false),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(""),
    [decision, setDecision] = useState<Record<string, string>>({}),
    [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const requests = [...(idea.editRequests || [])].reverse();
  const canRequest = canRequestIdeaEdit(idea, currentUser);
  if (!requests.length && !canRequest) return null;
  const member = (id?: string) => data.members.find((item) => item.id === id);
  const act = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ text: success, error: false });
      return true;
    } catch (error) {
      setMessage({ text: errorText(error), error: true });
      return false;
    } finally {
      setBusy("");
    }
  };
  return (
    <section aria-labelledby="edit-requests-title" className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="edit-requests-title" className="flex items-center gap-2 !text-base">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 drop-shadow-[0_3px_3px_rgba(32,39,60,.22)]">
            <defs>
              <linearGradient id="edit-request-pen" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FFC56B" />
                <stop offset="1" stopColor="#E08A1E" />
              </linearGradient>
            </defs>
            <path d="M15.6 3.4a2.4 2.4 0 0 1 3.4 0l1.6 1.6a2.4 2.4 0 0 1 0 3.4L9.4 19.6 4 20l.4-5.4z" fill="url(#edit-request-pen)" />
            <path d="M4.4 14.6 9.4 19.6 4 20z" fill="#7A4A12" />
            <path d="M14 5l5 5" stroke="#fff" strokeOpacity=".7" strokeWidth="1.4" />
          </svg>
          طلبات التعديل
        </h2>
        {canRequest && !composing && (
          <ActionButton onClick={() => setComposing(true)}>
            اطلب تعديلاً
          </ActionButton>
        )}
      </div>
      {composing && (
        <form
          className="space-y-3 rounded-xl bg-white p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await act(
              "new",
              () => store.requestEdit(idea.id, note),
              "أُرسل طلبك إلى مدير الإدارة ومدير النظام للموافقة.",
            );
            if (ok) {
              setNote("");
              setComposing(false);
            }
          }}
        >
          <label className="media-label">
            ما التعديل الذي تقترحه على هذا العمل؟
            <textarea
              className="media-input mt-2"
              rows={3}
              required
              minLength={3}
              maxLength={4000}
              value={note}
              autoFocus
              onChange={(event) => setNote(event.target.value)}
              placeholder="اكتب ملاحظاتك بوضوح حتى يفهمها صاحب الفكرة."
            />
          </label>
          <p className="text-xs text-[var(--soft)]">
            يصل الطلب إلى مدير الإدارة ومدير النظام، وبعد موافقة أحدهما تعود الفكرة إلى صاحبها مع ملاحظاتك.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={() => setComposing(false)} disabled={busy === "new"}>
              إلغاء
            </ActionButton>
            <ActionButton type="submit" primary disabled={busy === "new"}>
              {busy === "new" ? "جارٍ الإرسال…" : "إرسال الطلب"}
            </ActionButton>
          </div>
        </form>
      )}
      {requests.map((request) => {
        const requester = member(request.requesterId);
        const decider = member(request.decidedBy);
        const canDecide = canDecideIdeaEditOn(idea, currentUser, request);
        return (
          <article key={request.id} className="space-y-3 rounded-xl bg-white p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                <Avatar name={requester?.name || "زميل"} memberId={request.requesterId} />
                <span>
                  <strong>{requester?.name || "زميل"}</strong>
                  <span className="block text-xs text-[var(--soft)]">{formatDate(request.createdAt)}</span>
                </span>
              </span>
              <span className={STATUS[request.status].className}>{STATUS[request.status].label}</span>
            </header>
            <p className="whitespace-pre-wrap">{request.note}</p>
            {request.status !== "pending" && (
              <p className="text-xs text-[var(--soft)]">
                {decider?.name || "المدير"} · {formatDate(request.decidedAt)}
                {request.decisionNote ? ` · ${request.decisionNote}` : ""}
              </p>
            )}
            {canDecide && (
              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <label className="media-label">
                  ملاحظتك على الطلب
                  <textarea
                    className="media-input mt-2"
                    rows={2}
                    maxLength={4000}
                    value={decision[request.id] || ""}
                    onChange={(event) => setDecision({ ...decision, [request.id]: event.target.value })}
                    placeholder="اختيارية عند الموافقة، ومطلوبة عند الرفض."
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <ActionButton
                    disabled={!!busy}
                    onClick={() =>
                      act(request.id, () => store.decideEdit(idea.id, request.id, "rejected", decision[request.id] || ""), "أُبلغ صاحب الطلب بعدم الموافقة.")
                    }
                  >
                    عدم الموافقة
                  </ActionButton>
                  <ActionButton
                    primary
                    disabled={!!busy}
                    onClick={() =>
                      act(request.id, () => store.decideEdit(idea.id, request.id, "approved", decision[request.id] || ""), "وُوفق على التعديل، وعادت الفكرة إلى صاحبها مع الملاحظات.")
                    }
                  >
                    <Icon name="check" className="size-4" />
                    الموافقة على التعديل
                  </ActionButton>
                </div>
              </div>
            )}
          </article>
        );
      })}
      {message && (
        <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-[var(--danger)]" : "text-[#197254]"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

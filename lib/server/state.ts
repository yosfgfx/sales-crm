import type { Idea, MediaData, TeamMember } from "@/data/media";
import { database, type Queryable } from "./db";
import { loadIdeas, loadNotifications, loadReference } from "./repository";

const administrator = (member: TeamMember) => member.role === "admin" || member.role === "superadmin";

export function canSeeQuotations(viewer: TeamMember, idea: Pick<Idea, "ownerId">) {
  return administrator(viewer) || viewer.role === "manager" || idea.ownerId === viewer.id;
}

export function projectIdea(viewer: TeamMember, idea: Idea): Idea {
  const plain: Idea = administrator(viewer) || !idea.archive?.folderUrl ? idea : { ...idea, archive: { status: idea.archive.status, ...(idea.archive.archivedAt ? { archivedAt: idea.archive.archivedAt } : {}) } };
  if (canSeeQuotations(viewer, idea)) return plain;
  const hidden = new Set(plain.attachments.filter((file) => file.kind === "quotation").map((file) => file.id));
  const history = plain.history.map((event) => event.action === "quotation_added" ? { ...event, note: "أُضيف عرض سعر" } : event.action === "quotation_removed" ? { ...event, note: "حُذف عرض سعر" } : event);
  const projected: Idea = { ...plain, history, quotations: [], attachments: plain.attachments.filter((file) => !hidden.has(file.id)) };
  if (projected.sourceProposal) projected.sourceProposal = { ...projected.sourceProposal, funding: "", sourceApproval: "", reviewNote: undefined };
  if (projected.sourceProposal && projected.sourceProposal.reviewNote === undefined) delete projected.sourceProposal.reviewNote;
  return projected;
}

const CLOSED = ["delivered", "cancelled", "rejected"];
const LITE_AFTER_MS = 30 * 86_400_000;

export function liteIdea(idea: Idea): Idea {
  const lite: Idea = { ...idea, history: idea.history.slice(-1), content: "", executionPlan: "", managerFeedback: "", description: idea.description.slice(0, 160), partial: true };
  if (lite.sourceProposal) lite.sourceProposal = { ...lite.sourceProposal, originalGoal: "", originalConcept: "", reference: undefined, reviewNote: undefined };
  if (lite.sourceProposal) for (const key of ["reference", "reviewNote"] as const) if (lite.sourceProposal[key] === undefined) delete lite.sourceProposal[key];
  return lite;
}

export async function loadStateFor(viewer: TeamMember, q: Queryable = database(), now = Date.now()): Promise<{ version: number; data: MediaData }> {
  const [reference, ideas, notifications] = await Promise.all([loadReference(q), loadIdeas(q), loadNotifications(q, viewer.id)]);
  const shaped = ideas.map((idea) => {
    const projected = projectIdea(viewer, idea);
    return CLOSED.includes(idea.status) && now - new Date(idea.updatedAt).getTime() > LITE_AFTER_MS ? liteIdea(projected) : projected;
  });
  return { version: 0, data: { ...reference, ideas: shaped, notifications } };
}

export async function loadIdeaFor(viewer: TeamMember, id: string, q: Queryable = database()) {
  const [idea] = await loadIdeas(q, { ids: [id] });
  return idea ? projectIdea(viewer, idea) : null;
}

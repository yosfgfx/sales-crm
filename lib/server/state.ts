import type { Idea, MediaData, TeamMember } from "@/data/media";
import { database, type Queryable } from "./db";
import { loadIdeas, loadNotifications, loadReference } from "./repository";

const administrator = (member: TeamMember) => member.role === "admin" || member.role === "superadmin";

export function canSeeQuotations(viewer: TeamMember, idea: Pick<Idea, "ownerId">) {
  return administrator(viewer) || viewer.role === "manager" || idea.ownerId === viewer.id;
}

export function projectIdea(viewer: TeamMember, idea: Idea): Idea {
  const plain = idea;
  if (canSeeQuotations(viewer, idea)) return plain;
  const hidden = new Set(plain.attachments.filter((file) => file.kind === "quotation").map((file) => file.id));
  const projected: Idea = { ...plain, quotations: [], attachments: plain.attachments.filter((file) => !hidden.has(file.id)) };
  if (projected.sourceProposal) projected.sourceProposal = { ...projected.sourceProposal, funding: "", sourceApproval: "", reviewNote: undefined };
  if (projected.sourceProposal && projected.sourceProposal.reviewNote === undefined) delete projected.sourceProposal.reviewNote;
  return projected;
}

export async function loadStateFor(viewer: TeamMember, q: Queryable = database()): Promise<{ version: number; data: MediaData }> {
  const [reference, ideas, notifications] = await Promise.all([loadReference(q), loadIdeas(q), loadNotifications(q, viewer.id)]);
  return { version: 0, data: { ...reference, ideas: ideas.map((idea) => projectIdea(viewer, idea)), notifications } };
}

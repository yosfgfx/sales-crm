import type { MemberRole } from "./media";

export type SocialScope =
  | "team"
  | "idea"
  | "company"
  | "category"
  | "workspace"
  | "meeting";
export interface SocialContext {
  scope: SocialScope;
  scopeId: string;
}
export interface SocialVoice {
  id: string;
  mime: string;
  size: number;
  durationSeconds: number;
  url: string;
}
export interface SocialReaction {
  emoji: string;
  count: number;
  memberIds: string[];
}
export interface SocialMessage extends SocialContext {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: MemberRole;
  authorInitials: string;
  authorColor: string;
  text: string;
  mentions: string[];
  parentId: string | null;
  voice: SocialVoice | null;
  createdAt: string;
  deletedAt: string | null;
  pinnedAt: string | null;
  replyCount: number;
  reactions: SocialReaction[];
}
export interface SocialPage {
  messages: SocialMessage[];
  nextCursor: string | null;
  more: boolean;
  pinned: SocialMessage[];
}
export const SOCIAL_EMOJIS = [
  "👍",
  "❤️",
  "🎉",
  "👏",
  "🔥",
  "✅",
  "💡",
  "😊",
  "🙏",
  "👀",
] as const;
export const SOCIAL_VOICE_LIMIT_BYTES = 1024 * 1024;
export const SOCIAL_VOICE_LIMIT_SECONDS = 120;

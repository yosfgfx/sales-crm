"use client";

import type { MediaData, TeamMember } from "@/data/media";
import type { SocialScope } from "@/data/social";
import { DiscussionPanel } from "./discussion-panel";

export { DiscussionPanel } from "./discussion-panel";
export { MessageComposer } from "./composer";
export { MessageList } from "./message-list";
export { VoiceRecorder, VoicePlayer } from "./voice-recorder";
export type { VoiceDraft } from "./voice-recorder";

export function TeamChat({
  data,
  currentUser,
  initialThreadId,
}: {
  data: MediaData;
  currentUser: TeamMember | null;
  initialThreadId?: string;
}) {
  return (
    <DiscussionPanel
      key={`team:${currentUser?.id}`}
      context={{ scope: "team", scopeId: "main" }}
      title="حديث الفريق"
      description="مساحة مشتركة للأسئلة والأفكار السريعة والرسائل الصوتية والاحتفال بإنجازاتنا."
      data={data}
      currentUser={currentUser}
      initialThreadId={initialThreadId}
    />
  );
}
export function ContextDiscussion({
  contextType,
  contextId,
  title,
  data,
  currentUser,
  compact = true,
  initialThreadId,
}: {
  contextType: Exclude<SocialScope, "team">;
  contextId: string;
  title?: string;
  data: MediaData;
  currentUser: TeamMember | null;
  compact?: boolean;
  initialThreadId?: string;
}) {
  return (
    <DiscussionPanel
      key={`${contextType}:${contextId}:${currentUser?.id}`}
      context={{
        scope: contextType,
        scopeId: contextType === "workspace" ? "main" : contextId,
      }}
      title={title || "مناقشة الفريق"}
      description="الملاحظات والردود في مكان واحد، حتى بعد اكتمال العمل."
      data={data}
      currentUser={currentUser}
      compact={compact}
      initialThreadId={initialThreadId}
    />
  );
}

import type { MediaData } from "@/data/media";
import type { SocialContext } from "@/data/social";

/** Completion keeps discussion open. Only removed or paused entities prevent new messages. */
export function contextReadOnlyReason(
  context: SocialContext,
  data: MediaData,
): string | null {
  if (context.scope === "idea") {
    const idea = data.ideas.find((item) => item.id === context.scopeId);
    if (!idea)
      return "هذه الفكرة لم تعد متاحة. لا يمكن إضافة رسائل جديدة إلى نقاشها.";
    if (idea.deletedAt)
      return "هذا العمل في سلة المحذوفات. يمكنك قراءة النقاش السابق، وتعود الكتابة بعد استعادة العمل.";
  } else if (context.scope === "company") {
    const company = data.companies.find((item) => item.id === context.scopeId);
    if (!company || company.active === false)
      return "هذه الشركة موقوفة. يمكنك قراءة النقاش السابق، وتعود الكتابة بعد إعادة تفعيل الشركة.";
  } else if (context.scope === "category") {
    const category = data.categories.find(
      (item) => item.id === context.scopeId,
    );
    if (!category || category.active === false)
      return "هذا التصنيف موقوف. يمكنك قراءة النقاش السابق، وتعود الكتابة بعد إعادة تفعيله.";
  }
  return null;
}

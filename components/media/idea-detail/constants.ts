export const LIFECYCLE = {
  reject: { title: "رفض الفكرة نهائياً", description: "تُغلق الفكرة ولا تعود للتعديل. يصل السبب إلى صاحبها.", label: "سبب الرفض", action: "رفض الفكرة", done: "رُفضت الفكرة وأُشعر صاحبها." },
  cancel: { title: "إلغاء الفكرة", description: "تبقى الفكرة في السجل بحالة «ملغاة»، ويمكن لمدير النظام إعادة فتحها.", label: "سبب الإلغاء", action: "إلغاء الفكرة", done: "أُلغيت الفكرة." },
  reopen: { title: "إعادة فتح العمل", description: "يعود العمل المسلّم إلى التصميم، وتعود الفكرة الملغاة أو المرفوضة إلى المسودة.", label: "سبب إعادة الفتح", action: "إعادة الفتح", done: "أُعيد فتح العمل." },
  delete: { title: "حذف الفكرة نهائياً", description: "تُحذف الفكرة وسجلها ومرفقاتها من النظام، وتبقى نسخة منها في سجل الحذف لمدير النظام. ملفاتها في Google Drive لا تُحذف.", label: "سبب الحذف (اختياري)", action: "حذف الفكرة نهائياً", done: "حُذفت الفكرة." },
} as const;

export const ARCHIVE_TEXT: Record<string, string> = { done: "أُرشف العمل في مجلد المشروع على Google Drive.", pending: "بانتظار الأرشفة التلقائية في Google Drive.", running: "جارٍ رفع العمل إلى Google Drive.", failed: "تعذّرت الأرشفة مؤقتاً، وستُعاد المحاولة تلقائياً.", needs_review: "الأرشفة تحتاج مراجعة مدير النظام.", not_started: "لم يُؤرشف هذا العمل بعد." };

export type LifecycleDraft = { kind: "reject" | "cancel" | "reopen" | "delete"; text: string };

export type ScheduleBaseline = { designerId: string; scheduledAt: string; dueDate: string; priority: string };

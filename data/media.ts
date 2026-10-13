export type MemberRole = "superadmin" | "admin" | "content" | "manager" | "designer";
export type Channel = "screens" | "whatsapp" | "email";
export type WorkType = "motion" | "video" | "design" | "report" | "presentation" | "document";
export type Priority = "urgent" | "high" | "normal" | "low";
export type IdeaStatus = "draft" | "quotations" | "review" | "changes" | "approved" | "scheduled" | "designing" | "design_review" | "delivered" | "cancelled" | "rejected";
export type HistoryAction = "created" | "edited" | "submitted" | "changes_requested" | "approved" | "scheduled" | "design_started" | "design_review" | "delivered" | "attachments_added" | "attachment_removed" | "quotation_added" | "quotation_removed" | "comment" | "withdrawn" | "rejected" | "cancelled" | "reopened" | "reassigned" | "archived" | "deleted" | "restored";

export interface Company { id: string; name: string; shortName: string; initials: string; color: string; active?: boolean }
export interface ContentCategory { id: string; name: string; color: string; targetPerMonth: number; active?: boolean }
export interface TeamMember { id: string; name: string; role: MemberRole; title: string; initials: string; color: string; active: boolean }
export interface Attachment { id: string; name: string; size: number; mime: string; url: string; kind: "brief" | "quotation" | "final"; channel?: Channel; createdAt?: string }
export interface Quotation { id: string; vendor: string; amount: number; scope: string; days: number; attachmentId?: string; recommended: boolean }
export interface HistoryEvent { id: string; at: string; actorId: string; action: HistoryAction; note: string; from?: IdeaStatus; to?: IdeaStatus }
export interface SourceProposal { batchId: string; row: number; proposerName: string; funding: string; originalGoal: string; originalConcept: string; sourceApproval: string; reviewNote?: string; contentType?: string; platform?: string; reference?: string; fileName?: string }
export interface Idea {
  id: string; code: string; title: string; companyId: string; department: string; categoryId: string; workType: WorkType;
  description: string; content: string; executionPlan: string; channels: Channel[]; ownerId: string; designerId: string;
  requestedAt: string; dueDate: string; scheduledAt: string; deliveredAt?: string; approvedAt?: string;
  priority: Priority; status: IdeaStatus; needsQuotes: boolean; quotations: Quotation[]; attachments: Attachment[];
  managerFeedback: string; history: HistoryEvent[]; createdAt: string; updatedAt: string;
  sourceProposal?: SourceProposal;
  archive?: IdeaArchive;
  partial?: boolean;
  deletedAt?: string; deletedBy?: string; deletionReason?: string;
}
export type ArchiveStatus = "not_started" | "pending" | "running" | "done" | "failed" | "needs_review";
export interface IdeaArchive { status: ArchiveStatus; archivedAt?: string; folderUrl?: string }
export type NotificationEntity = "idea" | "company" | "category" | "member" | "settings" | "chat" | "workspace";
export interface MediaNotification {
  id: string; recipientId: string; ideaId: string; title: string; body: string;
  type: "approval" | "feedback" | "assignment" | "quotation" | "delivery" | "comment" | "archive" | "reminder" | "activity" | "achievement" | "chat" | "mention";
  createdAt: string; read: boolean;
  actorId?: string; actorName?: string; entityType?: NotificationEntity; entityId?: string; action?: string;
}
export interface SystemSettings { departmentName: string; organizationName: string; logoUrl: string; driveFolderId: string }
export interface MediaData { companies: Company[]; categories: ContentCategory[]; members: TeamMember[]; ideas: Idea[]; notifications: MediaNotification[]; settings: SystemSettings }
export interface VersionedMediaData { version: number; data: MediaData }
export type IdeaPatch = Partial<Pick<Idea, "title" | "companyId" | "department" | "categoryId" | "workType" | "description" | "content" | "executionPlan" | "channels" | "ownerId" | "requestedAt" | "dueDate" | "priority" | "needsQuotes">>;
export type NewIdeaInput = Pick<Idea, "title" | "companyId" | "department" | "categoryId" | "workType" | "description" | "content" | "executionPlan" | "channels" | "ownerId" | "requestedAt" | "dueDate" | "priority" | "needsQuotes">;
export type MemberPatch = Partial<Pick<TeamMember, "name" | "title" | "active">> & { role?: Exclude<MemberRole, "superadmin"> };
export type NewMemberInput = Pick<TeamMember, "name" | "title"> & { role: Exclude<MemberRole, "superadmin"> };
/** Account credentials are transient inputs. They must never enter shared MediaData. */
export type NewAccountInput = NewMemberInput & { username: string; password: string; email?: string };
export type AccountPatch = MemberPatch & { username?: string; password?: string; email?: string };
export type AccountBaseline = Pick<TeamMember, "name" | "title" | "role" | "active"> & { username: string };
export interface AccountSummary { memberId: string; username: string; hasPassword: boolean; protected: boolean; email?: string }
export interface AccountsResponse { version: number; accounts: AccountSummary[] }
export interface AccountMutationResponse extends VersionedMediaData { accounts: AccountSummary[]; currentUser: TeamMember | null; reloginRequired: boolean }
export interface ScheduleInput { designerId: string; scheduledAt: string; dueDate?: string; priority?: Priority }

export const STATUS_LABELS: Record<IdeaStatus, string> = { draft: "مسودة", quotations: "جمع عروض الأسعار", review: "بانتظار الاعتماد", changes: "مطلوب تعديل", approved: "معتمد · بانتظار الجدولة", scheduled: "مجدول", designing: "قيد التصميم", design_review: "المراجعة النهائية", delivered: "تم التسليم", cancelled: "ملغاة", rejected: "مرفوضة" };
export const STATUS_HINTS: Record<IdeaStatus, string> = {
  draft: "صاحب الفكرة يكتبها ويكمل تفاصيلها، ولا يراها المدير للاعتماد بعد.",
  quotations: "تُجمع عروض أسعار الموردين قبل إرسال الفكرة للاعتماد.",
  review: "أُرسلت الفكرة، وينتظر مدير الإدارة اعتماد الفكرة والمحتوى.",
  changes: "طلب المدير تعديلاً. يعدّلها صاحبها ثم يعيد إرسالها.",
  approved: "اعتُمدت الفكرة، ويحدد مدير الإدارة المصمم والموعد.",
  scheduled: "حُدد المصمم والموعد، ويمكن للمصمم البدء ورفع الملفات.",
  designing: "المصمم يعمل على التصميم.",
  design_review: "تُراجع النسخ النهائية لكل قناة قبل التسليم.",
  delivered: "سُلّم العمل، ويؤرشفه النظام تلقائياً في Google Drive.",
  cancelled: "أُلغيت الفكرة، ويمكن لمدير النظام إعادة فتحها.",
  rejected: "رفض المدير الفكرة نهائياً.",
};
export const WORK_TYPE_LABELS: Record<WorkType, string> = { motion: "موشن جرافيك", video: "مونتاج فيديو", design: "تصميم", report: "تقرير", presentation: "عرض تقديمي", document: "مستندات" };
export const CHANNEL_LABELS: Record<Channel, string> = { screens: "الشاشات الداخلية", whatsapp: "واتساب", email: "البريد الداخلي" };
export const PRIORITY_LABELS: Record<Priority, string> = { urgent: "عاجلة", high: "عالية", normal: "عادية", low: "منخفضة" };
export const ROLE_LABELS: Record<MemberRole, string> = { superadmin: "إدارة النظام", admin: "مدير النظام", content: "المحتوى والتنسيق", manager: "مدير الإدارة", designer: "التصميم" };
/** A member's public department/title is separate from their account permissions. */
export function memberDisplayLabel(member: Pick<TeamMember, "title" | "role">): string {
  return member.title.trim() || ROLE_LABELS[member.role];
}

export const MEDIA_COMPANIES: Company[] = [
  { id: "mawaredcom", name: "مواردكم لحلول الأعمال", shortName: "مواردكم", initials: "م", color: "#E0784A" },
  { id: "hayyen", name: "شركة هيّن للموارد البشرية", shortName: "هيّن", initials: "هـ", color: "#856DE2" },
  { id: "collection", name: "الموارد للتحصيل", shortName: "الموارد", initials: "م", color: "#45A793" },
  { id: "secureline", name: "شركة سيكيور لاين للتأمين", shortName: "سيكيور لاين", initials: "س", color: "#428AC6" },
];
export const MEDIA_CATEGORIES: ContentCategory[] = [
  { id: "wellbeing", name: "الصحة والعافية", color: "#53A58A", targetPerMonth: 4 },
  { id: "culture", name: "الثقافة والقيم", color: "#9276D4", targetPerMonth: 4 },
  { id: "awareness", name: "التوعية والمناسبات", color: "#CF9355", targetPerMonth: 4 },
  { id: "people", name: "الموظفون والمجتمع", color: "#D1788B", targetPerMonth: 4 },
  { id: "operations", name: "الأخبار والتحديثات", color: "#6A9CC9", targetPerMonth: 3 },
  { id: "learning", name: "التعلم والتطوير", color: "#769677", targetPerMonth: 3 },
];
export const MEDIA_MEMBERS: TeamMember[] = [
  { id: "admin", name: "عبدالله العتيبي", role: "admin", title: "مدير النظام", initials: "ع ع", color: "#DB8354", active: true },
  { id: "manager", name: "محمد الدوسري", role: "manager", title: "مدير التواصل الداخلي", initials: "م د", color: "#65829E", active: true },
  { id: "noura", name: "نورة الشهري", role: "content", title: "كتابة المحتوى والتنسيق", initials: "ن ش", color: "#A883BA", active: true },
  { id: "sara", name: "سارة القحطاني", role: "content", title: "كتابة المحتوى والتنسيق", initials: "س ق", color: "#C99672", active: true },
  { id: "faisal", name: "فيصل الحربي", role: "designer", title: "التصميم والموشن", initials: "ف ح", color: "#799D87", active: true },
  { id: "omar", name: "عمر الغامدي", role: "designer", title: "التصميم والمونتاج", initials: "ع غ", color: "#829DBB", active: true },
];

function demoAttachment(id: string, title: string, channel: Channel): Attachment {
  const dimensions = channel === "whatsapp" ? [360, 640] : channel === "email" ? [600, 360] : [640, 360];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions[0]}" height="${dimensions[1]}" viewBox="0 0 ${dimensions[0]} ${dimensions[1]}"><rect width="100%" height="100%" fill="#faf7f2"/><circle cx="${dimensions[0] / 2}" cy="${dimensions[1] / 3}" r="45" fill="#e7b99d"/><text x="50%" y="56%" text-anchor="middle" font-size="22" font-family="Arial" fill="#263a39">${title}</text><text x="50%" y="66%" text-anchor="middle" font-size="14" font-family="Arial" fill="#8b7464">نموذج تجريبي • ${CHANNEL_LABELS[channel]}</text></svg>`;
  return { id, name: `نموذج تجريبي - ${CHANNEL_LABELS[channel]}.svg`, size: new TextEncoder().encode(svg).length, mime: "image/svg+xml", url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, kind: "final", channel };
}

function sampleIdea(index: number, patch: Partial<Idea>): Idea {
  const requestedAt = patch.requestedAt ?? "2026-10-01";
  const title = patch.title ?? "فكرة تجريبية";
  const status = patch.status ?? "draft";
  const channels = patch.channels ?? ["screens", "whatsapp", "email"];
  const history: HistoryEvent[] = [ { id: `demo-history-${index}-1`, at: `${requestedAt}T07:00:00.000Z`, actorId: patch.ownerId ?? "noura", action: "created", note: "تم إنشاء الفكرة — بيانات تجريبية", to: "draft" } ];
  if (!["draft", "quotations", "review", "changes"].includes(status)) history.push({ id: `demo-history-${index}-2`, at: `${requestedAt}T10:00:00.000Z`, actorId: "manager", action: "approved", note: "تم اعتماد الفكرة — بيانات تجريبية", from: "review", to: "approved" });
  if (status === "changes") history.push({ id: `demo-history-${index}-2`, at: "2026-10-07T09:00:00.000Z", actorId: "manager", action: "changes_requested", note: patch.managerFeedback ?? "يرجى توضيح خطة التنفيذ قبل إعادة الإرسال.", from: "review", to: "changes" });
  if (status === "delivered") history.push({ id: `demo-history-${index}-3`, at: `${patch.deliveredAt}T11:00:00.000Z`, actorId: patch.designerId ?? "faisal", action: "delivered", note: "أُرفقت نماذج توضيحية للتجربة، وليست أعمال الفريق الفعلية.", from: "design_review", to: "delivered" });
  return {
    id: `idea-${String(index).padStart(3, "0")}`, code: `IC-2026-${String(index).padStart(3, "0")}`, title,
    companyId: "mawaredcom", department: "إدارة الموارد البشرية", categoryId: "culture", workType: "design",
    description: "تقديم محتوى واضح ومختصر للموظفين يعزز التواصل مع الإدارة ويشرح الرسالة بأسلوب بصري مناسب لكل قناة.",
    content: "معاً نصنع بيئة عمل أفضل. تعرّف على المبادرة وشاركنا رأيك عبر قنوات التواصل الداخلي.",
    executionPlan: "اعتماد النص، إعداد التصور البصري، تنفيذ النسخ المطلوبة للشاشات وواتساب والبريد، ثم مراجعة المخرجات وتسليمها للأرشفة.",
    channels, ownerId: "noura", designerId: ["scheduled", "designing", "design_review", "delivered"].includes(status) ? "faisal" : "",
    requestedAt, dueDate: "2026-10-12", scheduledAt: ["scheduled", "designing", "design_review", "delivered"].includes(status) ? requestedAt : "",
    priority: "normal", status, ...(!["draft", "quotations", "review", "changes"].includes(status) ? { approvedAt: `${requestedAt}T10:00:00.000Z` } : {}), needsQuotes: false, quotations: [],
    attachments: status === "delivered" ? channels.map((channel) => demoAttachment(`demo-${index}-${channel}`, title, channel)) : [],
    managerFeedback: "", history, createdAt: `${requestedAt}T07:00:00.000Z`, updatedAt: "2026-10-08T06:00:00.000Z",
    ...patch,
  };
}

export const INITIAL_MEDIA_DATA: MediaData = {
  companies: MEDIA_COMPANIES, categories: MEDIA_CATEGORIES, members: MEDIA_MEMBERS,
  settings: { departmentName: "إدارة التواصل الداخلي", organizationName: "مجموعة الموارد", logoUrl: "/assets/media/department-logo.png", driveFolderId: "" },
  ideas: [
    sampleIdea(1, { title: "صحتك أولاً · حملة الصحة النفسية", categoryId: "wellbeing", workType: "motion", status: "designing", priority: "high", dueDate: "2026-10-10", description: "حملة بمناسبة اليوم العالمي للصحة النفسية تدعو الموظفين إلى الاهتمام بصحتهم النفسية والاستفادة من خدمات الدعم المتاحة، مع رسائل قصيرة وقابلة للمشاركة.", content: "صحتك النفسية تستحق وقتك. خذ مساحة لنفسك، تحدّث، واطلب الدعم متى احتجت إليه.", executionPlan: "فيديو موشن ٣٠ ثانية بالعرض 16:9 للشاشات والطول 9:16 لواتساب، وبطاقة ثابتة للبريد الداخلي. مراجعة المعلومات مع إدارة الصحة والعافية قبل النشر." }),
    sampleIdea(2, { title: "أبطال الموارد · قصص من فريقنا", companyId: "collection", categoryId: "people", workType: "video", status: "review", priority: "high", ownerId: "sara", dueDate: "2026-10-14", description: "سلسلة لقاءات قصيرة تبرز إسهامات موظفي التحصيل وتحكي أثر التعاون والاحترافية في تحقيق نتائج الفريق.", content: "وراء كل إنجاز، فريق يصنع الفرق. تعرّفوا على أبطال الموارد وقصصهم.", executionPlan: "اختيار ثلاثة موظفين، تجهيز أسئلة المقابلة، تصوير يوم واحد، مونتاج نسختي 16:9 و9:16 وإعداد بطاقة للبريد." }),
    sampleIdea(3, { title: "مساحة للحوار · لقاء المدير التنفيذي", companyId: "hayyen", status: "changes", categoryId: "culture", workType: "presentation", dueDate: "2026-10-15", managerFeedback: "الفكرة مناسبة. يرجى إضافة جدول اللقاء وآلية استقبال أسئلة الموظفين، واختصار العرض إلى ٨ شرائح قبل إعادة الإرسال." }),
    sampleIdea(4, { title: "اليوم العالمي للادخار", companyId: "secureline", status: "quotations", categoryId: "awareness", workType: "motion", needsQuotes: true, ownerId: "sara", dueDate: "2026-10-25", description: "حملة توعوية تربط الادخار بالتخطيط المالي الشخصي من خلال أمثلة بسيطة تناسب جميع الموظفين.", executionPlan: "جمع عرضي أسعار للتعليق الصوتي، مقارنة التكلفة ومدة التنفيذ، اعتماد المورد، ثم إنتاج ثلاث رسائل مرئية." }),
    sampleIdea(5, { title: "قيمة الشهر · ننجز معاً", status: "approved", categoryId: "culture", priority: "high", dueDate: "2026-10-13" }),
    sampleIdea(6, { title: "تعرف على مزايا التأمين الجديدة", companyId: "secureline", status: "scheduled", categoryId: "operations", designerId: "omar", scheduledAt: "2026-10-11", dueDate: "2026-10-14", workType: "design", ownerId: "sara" }),
    sampleIdea(7, { title: "خطوة كل يوم · تحدي المشي", status: "design_review", categoryId: "wellbeing", workType: "motion", dueDate: "2026-10-09", priority: "urgent" }),
    sampleIdea(8, { title: "برنامج قادة الغد", companyId: "hayyen", status: "draft", categoryId: "learning", workType: "presentation", dueDate: "2026-10-20", channels: ["email"] }),
    sampleIdea(9, { title: "دليل التواصل الداخلي للموظفين الجدد", status: "review", categoryId: "operations", workType: "document", channels: ["email"], dueDate: "2026-10-18", department: "إدارة تجربة الموظف" }),
    sampleIdea(10, { title: "حصاد سبتمبر · إنجازات المجموعة", status: "delivered", categoryId: "operations", workType: "report", channels: ["email"], requestedAt: "2026-10-01", deliveredAt: "2026-10-04", dueDate: "2026-10-05", department: "الإدارة التنفيذية" }),
    sampleIdea(11, { title: "مرحباً بالزملاء الجدد", status: "delivered", categoryId: "people", requestedAt: "2026-10-02", deliveredAt: "2026-10-05", dueDate: "2026-10-05" }),
    sampleIdea(12, { title: "دقيقة معرفة · الأمن السيبراني", companyId: "secureline", status: "delivered", categoryId: "learning", workType: "motion", requestedAt: "2026-10-01", deliveredAt: "2026-10-06", dueDate: "2026-10-07", department: "إدارة تقنية المعلومات", designerId: "omar" }),
    sampleIdea(13, { title: "أسبوع الابتكار · فكرتك تصنع الفرق", companyId: "hayyen", status: "delivered", categoryId: "culture", workType: "video", requestedAt: "2026-10-03", deliveredAt: "2026-10-07", dueDate: "2026-10-08", department: "إدارة التطوير المؤسسي", ownerId: "sara", designerId: "omar" }),
    sampleIdea(14, { title: "اليوم الوطني · وطن يجمعنا", status: "delivered", categoryId: "awareness", workType: "motion", requestedAt: "2026-09-10", deliveredAt: "2026-09-22", dueDate: "2026-09-22" }),
    sampleIdea(15, { title: "رحلة الموظف · مزايا وخدمات", companyId: "hayyen", status: "delivered", categoryId: "people", workType: "document", channels: ["email"], requestedAt: "2026-09-08", deliveredAt: "2026-09-17", dueDate: "2026-09-18" }),
    sampleIdea(16, { title: "التواصل الفعال مع العملاء", companyId: "collection", status: "delivered", categoryId: "learning", workType: "presentation", channels: ["screens", "email"], requestedAt: "2026-09-06", deliveredAt: "2026-09-14", dueDate: "2026-09-15", department: "إدارة خدمة العملاء" }),
    sampleIdea(17, { title: "قواعد السلامة في مكان العمل", status: "delivered", categoryId: "wellbeing", requestedAt: "2026-09-02", deliveredAt: "2026-09-09", dueDate: "2026-09-10", department: "إدارة الصحة والعافية المؤسسية" }),
    sampleIdea(18, { title: "حصاد الفريق · سبتمبر", companyId: "collection", status: "delivered", categoryId: "operations", workType: "report", channels: ["email"], requestedAt: "2026-09-21", deliveredAt: "2026-09-29", dueDate: "2026-09-30", department: "الإدارة التنفيذية" }),
  ],
  notifications: [
    { id: "notification-demo-1", recipientId: "admin", ideaId: "idea-003", title: "ملاحظات تحتاج المتابعة", body: "أضاف المدير ملاحظاته على فكرة مساحة للحوار.", type: "feedback", createdAt: "2026-10-08T05:40:00.000Z", read: false },
    { id: "notification-demo-2", recipientId: "noura", ideaId: "idea-003", title: "الفكرة تحتاج تعديلاً", body: "يرجى إضافة جدول اللقاء وآلية استقبال الأسئلة.", type: "feedback", createdAt: "2026-10-07T09:00:00.000Z", read: false },
    { id: "notification-demo-3", recipientId: "manager", ideaId: "idea-002", title: "فكرة بانتظار اعتمادك", body: "أبطال الموارد · قصص من فريقنا جاهزة للمراجعة.", type: "approval", createdAt: "2026-10-08T06:00:00.000Z", read: false },
    { id: "notification-demo-4", recipientId: "faisal", ideaId: "idea-005", title: "فكرة معتمدة جاهزة للجدولة", body: "قيمة الشهر · ننجز معاً تنتظر جدولة التصميم.", type: "assignment", createdAt: "2026-10-08T05:00:00.000Z", read: false },
  ],
};

/** Each caller gets an isolated copy; sample records are clearly identified in the UI. */
export function createInitialMediaData(): MediaData { return structuredClone(INITIAL_MEDIA_DATA); }

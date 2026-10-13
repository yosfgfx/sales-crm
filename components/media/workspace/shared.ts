import { WORK_TYPE_LABELS, ideaCompanyLabel, type Idea, type MediaData } from "@/data/media";
import type { IconName } from "../ui";

export type View =
  | "today"
  | "overview"
  | "meetings"
  | "people"
  | "honor"
  | "ideas"
  | "approvals"
  | "design"
  | "calendar"
  | "archive"
  | "reports"
  | "chat"
  | "admin";
export const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: "today", label: "يومي", icon: "home" },
  { id: "overview", label: "نظرة عامة", icon: "grid" },
  { id: "ideas", label: "الأفكار والمحتوى", icon: "ideas" },
  { id: "approvals", label: "اعتمادات المدير", icon: "check" },
  { id: "design", label: "استوديو التصميم", icon: "design" },
  { id: "calendar", label: "تقويم التنفيذ", icon: "calendar" },
  { id: "archive", label: "أرشيف الأعمال", icon: "archive" },
  { id: "reports", label: "التقارير الشهرية", icon: "report" },
  { id: "meetings", label: "الاجتماعات", icon: "clock" },
  { id: "chat", label: "دردشة الفريق", icon: "chat" },
  { id: "people", label: "الفريق", icon: "people" },
  { id: "honor", label: "لوحة الشرف", icon: "trophy" },
];
export const descriptions: Record<View, string> = {
  today: "خطة يومك، وتركيزك، وفريقك في مكان واحد.",
  overview: "كل فكرة، وكل مرحلة، في مساحة واحدة.",
  meetings: "غرفة الفريق يوم العمل عن بعد: أجندة وملاحظات وقرارات ومهام.",
  people: "من متصل الآن، ومن يعمل على ماذا.",
  honor: "نحتفي بمن يُنجز في موعده ويحضر مع فريقه.",
  ideas: "من فكرة واضحة إلى محتوى جاهز للاعتماد.",
  approvals: "راجع التفاصيل والعروض، ثم وجّه الفريق إلى الخطوة التالية.",
  design: "حوّل الأفكار المعتمدة إلى أعمال تستحق المشاهدة.",
  calendar: "رتّب التنفيذ والنشر حسب مواعيد الفريق.",
  archive: "ذاكرة الفريق؛ كل عمل وتفاصيله ونسخه النهائية.",
  reports: "وثّق أثر الفريق بتقرير شهري جاهز للمشاركة.",
  chat: "مساحة الفريق للرسائل والردود والصوتيات وتبادل التقدير.",
  admin: "الشركات والتصنيفات وهوية التقارير وإعدادات الأرشفة.",
};
export const production = ["approved", "scheduled", "designing", "design_review"];
export const nameOf = (data: MediaData, id?: string) =>
  data.members.find((member) => member.id === id)?.name || "غير مسند";
export const companyOf = (data: MediaData, id: string) =>
  data.companies.find((company) => company.id === id)?.name || "شركة";
export function matches(idea: Idea, query: string, data: MediaData) {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u064B-\u065F]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .toLowerCase();
  return normalize(
    [
      idea.title,
      idea.code,
      idea.description,
      idea.content,
      idea.department,
      ideaCompanyLabel(idea, data.companies),
      idea.sourceProposal?.proposerName,
      idea.sourceProposal?.originalGoal,
      idea.sourceProposal?.originalConcept,
      data.categories.find((c) => c.id === idea.categoryId)?.name,
      WORK_TYPE_LABELS[idea.workType],
      nameOf(data, idea.ownerId),
      ...idea.attachments.map((a) => a.name),
    ].join(" "),
  ).includes(normalize(query.trim()));
}

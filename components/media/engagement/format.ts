import { CHANNEL_LABELS, type Idea, type TeamMember } from "@/data/media";
import { missingDeliveryChannels } from "@/lib/media-workflow";
import { addressed } from "@/data/engagement";

export const arNum = (value: number) => value.toLocaleString("ar-SA");
export const firstName = (name: string) => name.split(" ")[0] || name;

export function riyadhDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(date);
}
export function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}
export const isWorkDay = (day: string) => ![5, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());

export function minutesText(total: number) {
  const hours = Math.floor(total / 60), minutes = Math.round(total % 60);
  if (!hours) return `${arNum(minutes)} د`;
  return minutes ? `${arNum(hours)} س ${arNum(minutes)} د` : `${arNum(hours)} س`;
}

export function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600), m = Math.floor((safe % 3600) / 60), s = safe % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function dueText(dueDate: string, today = riyadhDay()) {
  if (!dueDate) return { label: "بلا موعد", tone: "neutral" as const };
  const gap = daysBetween(today, dueDate);
  if (gap < 0) return { label: gap === -1 ? "متأخر يوماً" : `متأخر ${arNum(-gap)} أيام`, tone: "late" as const };
  if (gap === 0) return { label: "موعده اليوم", tone: "today" as const };
  if (gap === 1) return { label: "موعده غداً", tone: "soon" as const };
  if (gap === 2) return { label: "موعده بعد يومين", tone: "soon" as const };
  return { label: `بعد ${arNum(gap)} أيام`, tone: "later" as const };
}

export function relativeTime(iso: string | null, now = Date.now()) {
  if (!iso) return "لم يظهر بعد";
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 2) return "الآن";
  if (minutes < 60) return `قبل ${arNum(minutes)} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "قبل ساعة" : `قبل ${arNum(hours)} ساعات`;
  const days = Math.round(hours / 24);
  return days === 1 ? "أمس" : `قبل ${arNum(days)} أيام`;
}

export function greeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", hourCycle: "h23" }).format(date));
  return hour < 12 ? "صباح الخير" : "مساء الخير";
}

export const STAGES = [["draft", "quotations"], ["review", "changes"], ["approved", "scheduled"], ["designing"], ["design_review"], ["delivered"]];
export const stageIndex = (idea: Idea) => Math.max(0, STAGES.findIndex((group) => group.includes(idea.status)));

export function nextStep(idea: Idea, member: TeamMember) {
  const f = member.addressForm;
  switch (idea.status) {
    case "draft":
      return addressed(f, "أكمل تفاصيل الفكرة وأرسلها للاعتماد.", "أكملي تفاصيل الفكرة وأرسليها للاعتماد.");
    case "quotations":
      return addressed(f, "أرفق عروض الأسعار ثم أرسل الفكرة للاعتماد.", "أرفقي عروض الأسعار ثم أرسلي الفكرة للاعتماد.");
    case "changes":
      return addressed(f, "نفّذ الملاحظات المطلوبة وأعد إرسال الفكرة.", "نفّذي الملاحظات المطلوبة وأعيدي إرسال الفكرة.");
    case "review":
      return "الفكرة بانتظار اعتماد مدير الإدارة.";
    case "approved":
      return "بانتظار تحديد المصمم وموعد التنفيذ.";
    case "scheduled":
      return addressed(f, "ابدأ التصميم من صفحة العمل.", "ابدئي التصميم من صفحة العمل.");
    case "designing":
    case "design_review": {
      const missing = missingDeliveryChannels(idea);
      if (missing.length) return addressed(f, `ارفع النسخة النهائية لقناة ${CHANNEL_LABELS[missing[0]]} ليصبح العمل جاهزاً للتسليم.`, `ارفعي النسخة النهائية لقناة ${CHANNEL_LABELS[missing[0]]} ليصبح العمل جاهزاً للتسليم.`);
      return idea.status === "designing" ? addressed(f, "كل النسخ جاهزة، أرسل العمل للمراجعة النهائية.", "كل النسخ جاهزة، أرسلي العمل للمراجعة النهائية.") : addressed(f, "كل النسخ جاهزة، سجّل التسليم النهائي.", "كل النسخ جاهزة، سجّلي التسليم النهائي.");
    }
    default:
      return "";
  }
}

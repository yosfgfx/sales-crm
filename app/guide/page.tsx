import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_HINTS, STATUS_LABELS, type IdeaStatus } from "@/data/media";

export const metadata: Metadata = {
  title: "دليل الاستخدام | وصل",
  robots: { index: false, follow: false },
};

const FLOW: IdeaStatus[] = [
  "draft",
  "quotations",
  "review",
  "changes",
  "approved",
  "scheduled",
  "designing",
  "delivered",
];

const ROLES = [
  {
    title: "المحتوى والتنسيق",
    text: "يكتب الفكرة ومحتواها، ويرفق المراجع وعروض الأسعار، ثم يرسلها للاعتماد. يستطيع حذف فكرته قبل اعتمادها.",
  },
  {
    title: "مدير الإدارة",
    text: "يعتمد الأفكار والمحتوى أو يطلب تعديلها أو يرفضها، ثم يحدد المصمم والموعد. لا يعتمد فكرة هو صاحبها.",
  },
  {
    title: "التصميم",
    text: "ينفذ التصميم ويرفع النسخ النهائية لكل قناة، ثم يسلّم العمل.",
  },
  {
    title: "مدير النظام",
    text: "يدير الحسابات والشركات والتصنيفات، ويستورد الأفكار، ويتابع الأرشفة. يلزمه التحقق بخطوتين.",
  },
];

export default function GuidePage() {
  return (
    <div
      dir="rtl"
      className="media-app min-h-dvh bg-[var(--background)] text-[var(--foreground)]"
    >
      <main className="mx-auto max-w-[46em] space-y-8 px-4 py-12 leading-8">
        <div className="space-y-2">
          <h1>دليل استخدام وصل</h1>
          <p>
            صفحة واحدة تشرح من يفعل ماذا، ومراحل العمل من الفكرة إلى الأرشيف.
          </p>
          <Link
            href="/"
            className="text-[var(--primary)] underline underline-offset-4"
          >
            العودة إلى مساحة العمل
          </Link>
        </div>

        <section className="space-y-3" aria-labelledby="roles">
          <h2 id="roles">الأدوار</h2>
          <ul className="space-y-3">
            {ROLES.map((role) => (
              <li
                key={role.title}
                className="rounded-xl border border-[var(--border)] p-4"
              >
                <h3 className="!text-base">{role.title}</h3>
                <p>{role.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="flow">
          <h2 id="flow">مراحل العمل</h2>
          <ol className="list-decimal space-y-2 ps-6">
            {FLOW.map((status) => (
              <li key={status}>
                <strong>{STATUS_LABELS[status]}:</strong> {STATUS_HINTS[status]}
              </li>
            ))}
          </ol>
          <p>
            وفي أي وقت قبل التسليم: يسحب صاحب الفكرة فكرته إلى المسودة، أو
            يلغيها مدير النظام، ويعيد فتحها عند الحاجة. وكل ذلك يُسجَّل في سجل
            الفكرة.
          </p>
        </section>

        <section className="space-y-3" aria-labelledby="files">
          <h2 id="files">الملفات والأرشيف</h2>
          <ul className="list-disc space-y-2 ps-6">
            <li>
              ترفع الملفات من تبويب «المرفقات» في الفكرة، حتى 2 جيجابايت للملف،
              وتُحفظ مباشرة في مجلد المشروع على Google Drive.
            </li>
            <li>
              لا تحتاج حساب Google ولا تتصفح Drive. تصل إلى ملفات مشروعك من
              الفكرة نفسها.
            </li>
            <li>
              عند التسليم يؤرشف النظام المشروع تلقائياً في مجلد شهر التسليم
              والشركة، ومعه ملف «ملخص المشروع».
            </li>
            <li>
              عروض الأسعار ومبالغها يراها صاحب الفكرة ومدير الإدارة ومدير النظام
              فقط.
            </li>
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="alerts">
          <h2 id="alerts">الإشعارات والمواعيد</h2>
          <ul className="list-disc space-y-2 ps-6">
            <li>تصلك الإشعارات داخل النظام وعلى بريدك عند كل خطوة تخصك.</li>
            <li>
              يذكّرك النظام قبل موعد التسليم بيومين، ويبلغ المدير إن تأخر العمل.
            </li>
            <li>تُحذف الإشعارات المقروءة بعد 90 يوماً.</li>
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="account">
          <h2 id="account">حسابك</h2>
          <ul className="list-disc space-y-2 ps-6">
            <li>
              غيّر كلمة المرور وفعّل التحقق بخطوتين من «حسابي» في أسفل القائمة.
            </li>
            <li>إن نسيت كلمة المرور فاطلب من مدير النظام إعادة تعيينها.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

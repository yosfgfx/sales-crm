import { expect, test } from "@playwright/test";
import { createIdea, daysFromNow, navigate, openIdea, pageAs, unique } from "./helpers";

test("an idea can serve several companies, then all companies (multi-company)", async ({ browser }) => {
  const noura = await pageAs(browser, "noura");
  const title = unique("حملة مشتركة");
  const created = await createIdea(noura, title);
  await created.getByRole("button", { name: "تعديل الفكرة" }).click();
  const edit = noura.getByRole("dialog", { name: "تعديل الفكرة" });
  await edit.getByRole("button", { name: /^هيّن/ }).click();
  await edit.getByRole("button", { name: "حفظ التعديلات" }).click();
  const detail = noura.getByRole("dialog", { name: title });
  await expect(detail).toContainText("هيّن");
  await detail.getByRole("button", { name: "تعديل الفكرة" }).click();
  await noura.getByRole("dialog", { name: "تعديل الفكرة" }).getByRole("button", { name: "كل الشركات" }).click();
  await noura.getByRole("dialog", { name: "تعديل الفكرة" }).getByRole("button", { name: "حفظ التعديلات" }).click();
  await expect(noura.getByRole("dialog", { name: title })).toContainText("كل الشركات");
});

test("a colleague requests an edit and the department manager approves it (edit requests)", async ({ browser }) => {
  const noura = await pageAs(browser, "noura");
  const title = unique("فكرة للتعديل");
  await createIdea(noura, title);
  const sara = await pageAs(browser, "sara");
  const view = await openIdea(sara, title);
  await view.getByRole("button", { name: "اطلب تعديلاً" }).click();
  await view.getByLabel("ما التعديل الذي تقترحه على هذا العمل؟").fill("أضف رقم التواصل في نهاية الرسالة");
  await view.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(view.getByText("بانتظار الموافقة")).toBeVisible();
  const manager = await pageAs(browser, "manager");
  await navigate(manager, "اعتمادات المدير");
  await manager.getByRole("tab", { name: /طلبات التعديل/ }).click();
  await expect(manager.getByText("أضف رقم التواصل في نهاية الرسالة")).toBeVisible();
  const review = await openIdea(manager, title);
  await review.getByRole("button", { name: "الموافقة على التعديل" }).click();
  await expect(review.getByText("تمت الموافقة")).toBeVisible();
});

test("meetings: the manager schedules one, a member joins, and an action item lands in their day (meetings)", async ({ browser }) => {
  const manager = await pageAs(browser, "manager");
  await navigate(manager, "الاجتماعات");
  await manager.getByRole("button", { name: "اجتماع جديد" }).click();
  const dialog = manager.getByRole("dialog", { name: "اجتماع جديد" });
  const title = unique("اجتماع الفريق");
  await dialog.getByLabel("عنوان الاجتماع").fill(title);
  await dialog.getByLabel("اليوم").fill(daysFromNow(1));
  await dialog.getByLabel("الساعة").fill("11:00");
  await dialog.getByRole("textbox", { name: "البند ١" }).fill("أعمال الأسبوع");
  await dialog.getByLabel("رابط Microsoft Teams").fill("https://teams.microsoft.com/l/meetup-join/e2e");
  await dialog.getByRole("button", { name: "إنشاء الاجتماع" }).click();
  await expect(manager.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await manager.getByRole("button", { name: "بدء الاجتماع الآن" }).click();
  await expect(manager.getByText(/يجري الآن/).first()).toBeVisible();
  const task = unique("إرسال صورة المشهد");
  await manager.getByRole("textbox", { name: "مهمة جديدة", exact: true }).fill(task);
  await manager.getByLabel("المسؤول").selectOption({ label: "سارة القحطاني" });
  await manager.getByRole("button", { name: "إضافة المهمة" }).click();
  await expect(manager.getByText(/أُضيفت إلى «يومي» لدى سارة/)).toBeVisible();

  const sara = await pageAs(browser, "sara");
  await expect(sara.getByText(task).first()).toBeVisible();
  await navigate(sara, "الاجتماعات");
  await sara.getByRole("button", { name: new RegExp(title) }).click();
  await expect(sara.getByRole("button", { name: "مغادرة الغرفة" })).toBeVisible();
  await expect(sara.getByRole("link", { name: "فتح رابط Teams" })).toHaveAttribute("href", /teams\.microsoft\.com/);
});

test("the daily home, honor board and team pages render, and profiles are limited to managers", async ({ browser }) => {
  const sara = await pageAs(browser, "sara");
  await expect(sara.getByRole("main").getByRole("heading", { level: 1, name: /الخير يا سارة/ })).toBeVisible();
  await sara.getByLabel("إضافة مهمة").first().fill("تجهيز مسودة رسالة الجمعة");
  await sara.getByLabel("إضافة مهمة").first().press("Enter");
  await expect(sara.getByText("تجهيز مسودة رسالة الجمعة")).toBeVisible();
  await navigate(sara, "لوحة الشرف");
  await expect(sara.getByRole("heading", { name: "كيف يُختار الموظف المثالي؟" })).toBeVisible();
  await expect(sara.getByRole("table", { name: "الدرجات التفصيلية لهذا الشهر" })).toHaveCount(0);
  await navigate(sara, "الفريق");
  await expect(sara.getByRole("button", { name: /فيصل الحربي/ })).toHaveCount(0);
  const manager = await pageAs(browser, "manager");
  await navigate(manager, "الفريق");
  await manager.getByRole("button", { name: /فيصل الحربي/ }).click();
  await expect(manager.getByText("لوحة الإنجاز تظهر لمدير النظام ومدير الإدارة فقط")).toBeVisible();
  await expect(manager.getByText("نشاط آخر ٥ أسابيع")).toBeVisible();
});

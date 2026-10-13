import { expect, test } from "@playwright/test";
import { createIdea, openIdea, pageAs, unique } from "./helpers";

test("content cannot approve, the manager rejects with a reason, and the owner is told (H3, M1)", async ({ browser }, info) => {
  const title = unique(`رفض ${info.project.name}`);
  const noura = await pageAs(browser, "noura");
  let idea = await createIdea(noura, title);
  await idea.getByRole("button", { name: "إرسال للاعتماد" }).click();
  await expect(idea.getByText("بانتظار الاعتماد").first()).toBeVisible();
  await expect(idea.getByRole("button", { name: "اعتماد الفكرة" })).toHaveCount(0);

  const manager = await pageAs(browser, "manager");
  idea = await openIdea(manager, title);
  await idea.getByRole("button", { name: "رفض نهائي" }).click();
  const reject = manager.getByRole("dialog", { name: "رفض الفكرة نهائياً" });
  await reject.getByLabel("سبب الرفض").fill("مكررة مع حملة الشهر الماضي.");
  await reject.getByRole("button", { name: "رفض الفكرة" }).click();
  await expect(idea.getByText("مرفوضة").first()).toBeVisible();
  await idea.getByRole("tab", { name: "سجل العمل" }).click();
  await expect(idea.getByText(/مكررة مع حملة الشهر الماضي/).first()).toBeVisible();
  await noura.reload();
  await noura.getByRole("button", { name: /فتح الإشعارات/ }).click();
  await expect(noura.getByRole("dialog", { name: "الإشعارات" }).getByText(new RegExp(title.split(" ").at(-1)!)).first()).toBeVisible();
});

test("an administrator moves a draft to the trash, cancels and reopens with an audit trail (H3)", async ({ browser }, info) => {
  const draft = unique(`مسودة للحذف ${info.project.name}`);
  const noura = await pageAs(browser, "noura");
  let idea = await createIdea(noura, draft);
  await expect(idea.getByRole("button", { name: "حذف الفكرة" })).toHaveCount(0);
  const trashAdmin = await pageAs(browser, "admin");
  idea = await openIdea(trashAdmin, draft);
  await idea.getByRole("button", { name: "حذف الفكرة" }).click();
  const remove = trashAdmin.getByRole("dialog", { name: "نقل العمل إلى سلة المحذوفات" });
  await remove.getByLabel("سبب الحذف (اختياري)").fill("أُدخلت بالخطأ.");
  await remove.getByRole("button", { name: "نقل إلى سلة المحذوفات" }).click();
  await expect(trashAdmin.getByRole("dialog", { name: draft })).toBeHidden();

  const kept = unique(`فكرة للإلغاء ${info.project.name}`);
  idea = await createIdea(noura, kept);
  const admin = await pageAs(browser, "admin");
  idea = await openIdea(admin, kept);
  await idea.getByRole("button", { name: "إلغاء الفكرة" }).click();
  const cancel = admin.getByRole("dialog", { name: "إلغاء الفكرة" });
  await cancel.getByLabel("سبب الإلغاء").fill("أُجلت للربع القادم.");
  await cancel.getByRole("button", { name: "إلغاء الفكرة" }).click();
  await expect(idea.getByText("ملغاة").first()).toBeVisible();
  await idea.getByRole("button", { name: "إعادة فتح" }).click();
  const reopen = admin.getByRole("dialog", { name: "إعادة فتح العمل" });
  await reopen.getByLabel("سبب إعادة الفتح").fill("عادت الحاجة إليها.");
  await reopen.getByRole("button", { name: "إعادة الفتح" }).click();
  await expect(idea.getByText("مسودة").first()).toBeVisible();
});

test("a manager who owns an idea cannot approve it (M1)", async ({ browser }, info) => {
  const title = unique(`فكرة المدير ${info.project.name}`);
  const admin = await pageAs(browser, "admin");
  const idea = await createIdea(admin, title);
  await idea.getByRole("button", { name: "إرسال للاعتماد" }).click();
  await expect(idea.getByText("بانتظار الاعتماد").first()).toBeVisible();
  await expect(idea.getByText("يعتمد هذه الفكرة مدير آخر لأنك صاحبها.")).toBeVisible();
  await expect(idea.getByRole("button", { name: "اعتماد الفكرة" })).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { ORIGIN, pageAs, unique } from "./helpers";

test("an administrator deletes a member permanently after confirming the name (member removal)", async ({ browser }) => {
  const admin = await pageAs(browser, "admin");
  const name = unique("عضو مؤقت");
  const username = `temp${Date.now().toString(36)}`;
  const created = await admin.request.post("/api/accounts", { data: { operation: "create", member: { name, title: "اختبار", role: "content" }, username, password: "Temp-Member-Pass-2026" }, headers: { origin: String(test.info().project.use.baseURL || ORIGIN) } });
  expect(created.status()).toBe(200);
  await admin.reload();
  const menu = admin.getByRole("button", { name: "فتح القائمة الرئيسية" });
  if (await menu.isVisible()) await menu.click();
  await admin.getByRole("button", { name: "إدارة النظام" }).click();
  await admin.getByRole("tab", { name: "الفريق والصلاحيات" }).click();
  await admin.getByRole("button", { name: `حذف حساب ${name} نهائياً` }).click();
  const dialog = admin.getByRole("dialog", { name: `حذف ${name} نهائياً` });
  await expect(dialog.getByText("لا توجد أعمال مفتوحة تحتاج إعادة إسناد.")).toBeVisible();
  const submit = dialog.getByRole("button", { name: "حذف نهائي وإعادة الإسناد" });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel(/للتأكيد اكتب اسم العضو/).fill(name);
  await submit.click();
  await expect(admin.getByText(`حُذف حساب ${name} نهائياً.`)).toBeVisible();
  await expect(admin.getByRole("button", { name: `حذف حساب ${name} نهائياً` })).toHaveCount(0);
});

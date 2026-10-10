import { expect, test, type Page } from "@playwright/test";
import accounts from "./accounts.json";
import { openIdea, pageAs, projectContext } from "./helpers";

async function loginForm(page: Page, username: string, password: string) {
  await page.getByLabel("اسم تسجيل الدخول").fill(username);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: /دخول مساحة العمل/ }).click();
}

async function openAdministration(page: Page) {
  const menu = page.getByRole("button", { name: "فتح القائمة الرئيسية" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "إدارة النظام" }).click();
}

test("guessing a password slows that device down while the owner still signs in elsewhere (M5)", async ({ browser }, info) => {
  const attackerIp = info.project.name === "desktop" ? "203.0.113.21" : "203.0.113.22";
  const attacker = await (await browser.newContext(projectContext({ extraHTTPHeaders: { "x-nf-client-connection-ip": attackerIp } }))).newPage();
  await attacker.goto("/");
  for (let attempt = 0; attempt < 5; attempt++) {
    await loginForm(attacker, "root", `wrong-password-${attempt}`);
    await expect(attacker.getByRole("alert").filter({ hasText: /غير صحيحة/ })).toBeVisible();
  }
  await loginForm(attacker, "root", accounts.root);
  await expect(attacker.getByRole("alert").filter({ hasText: /محاولات دخول خاطئة كثيرة/ })).toBeVisible();

  const owner = await (await browser.newContext(projectContext({ extraHTTPHeaders: { "x-nf-client-connection-ip": "198.51.100.77" } }))).newPage();
  await owner.goto("/");
  await loginForm(owner, "root", accounts.root);
  await expect(owner.getByRole("main").getByRole("heading", { level: 1 })).toContainText("مرحبًا");
});

test("a departing designer's work is reassigned, then the account is switched off and back on (H4)", async ({ browser }) => {
  const admin = await pageAs(browser, "admin");
  const idea = await openIdea(admin, "تعرف على مزايا التأمين الجديدة");
  await idea.getByRole("button", { name: "إعادة الإسناد" }).click();
  const reassign = admin.getByRole("dialog", { name: "إعادة إسناد العمل" });
  await reassign.getByLabel("المصمم").selectOption({ label: "فيصل الحربي" });
  await reassign.getByRole("button", { name: "حفظ الإسناد" }).click();
  await expect(reassign).toBeHidden();
  await expect(idea.getByText("فيصل الحربي").first()).toBeVisible();
  await idea.getByRole("button", { name: "إغلاق النافذة" }).click();

  await openAdministration(admin);
  await admin.getByRole("tab", { name: "الفريق والصلاحيات" }).click();
  await admin.getByRole("button", { name: /تعديل حساب عمر الغامدي/ }).click();
  const form = admin.getByRole("dialog", { name: /تعديل حساب/ });
  await form.getByRole("checkbox", { name: /السماح للمستخدم بالدخول/ }).uncheck();
  await form.getByRole("button", { name: "حفظ الحساب" }).click();
  await expect(form).toBeHidden();

  const omar = await (await browser.newContext(projectContext({ extraHTTPHeaders: { "x-nf-client-connection-ip": "198.51.100.88" } }))).newPage();
  await omar.goto("/");
  await loginForm(omar, "omar", accounts.omar);
  await expect(omar.getByRole("alert").filter({ hasText: /غير مفعّل|غير صحيحة/ })).toBeVisible();

  await admin.getByRole("button", { name: /تعديل حساب عمر الغامدي/ }).click();
  await form.getByRole("checkbox", { name: /السماح للمستخدم بالدخول/ }).check();
  await form.getByRole("button", { name: "حفظ الحساب" }).click();
  await expect(form).toBeHidden();
});

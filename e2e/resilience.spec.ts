import { expect, test } from "@playwright/test";
import { createIdea, openIdea, pageAs, projectContext, signIn, unique } from "./helpers";

async function comment(dialog: import("@playwright/test").Locator, text: string) {
  await dialog.getByRole("tab", { name: "سجل العمل" }).click();
  await dialog.getByLabel("إضافة تعليق للفريق").fill(text);
  await dialog.getByRole("button", { name: "إضافة التعليق" }).click();
}

test("a dropped connection shows an Arabic message and retry repeats the same action (M11)", async ({ browser }, info) => {
  const title = unique(`انقطاع ${info.project.name}`);
  const noura = await pageAs(browser, "noura");
  const idea = await createIdea(noura, title);
  await noura.route("**/api/ops", (route) => route.abort("internetdisconnected"), { times: 1 });
  const text = unique("تعليق بعد الانقطاع");
  await comment(idea, text);
  await expect(noura.getByText(/تعذّر الاتصال بالنظام/).first()).toBeVisible();
  await idea.getByRole("button", { name: "إغلاق النافذة" }).click();
  const banner = noura.getByRole("alert").filter({ hasText: /تعذّر الاتصال بالنظام/ });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "إعادة المحاولة" }).click();
  const reopened = await openIdea(noura, title);
  await reopened.getByRole("tab", { name: "سجل العمل" }).click();
  await expect(reopened.getByText(text)).toHaveCount(1);
});

test("a device whose clock is 10 minutes behind still saves with server time (M4)", async ({ browser }, info) => {
  const context = await browser.newContext(projectContext());
  const page = await context.newPage();
  await page.clock.install({ time: new Date(Date.now() - 10 * 60_000) });
  await signIn(page, "sara");
  const title = unique(`ساعة متأخرة ${info.project.name}`);
  const idea = await createIdea(page, title);
  const text = unique("تعليق من جهاز متأخر");
  await comment(idea, text);
  await expect(idea.getByText(text)).toBeVisible();
});

test("two people saving at the same moment on different ideas both succeed (H7)", async ({ browser }, info) => {
  const [noura, sara] = await Promise.all([pageAs(browser, "noura"), pageAs(browser, "sara")]);
  const first = await createIdea(noura, unique(`تزامن أ ${info.project.name}`));
  const second = await createIdea(sara, unique(`تزامن ب ${info.project.name}`));
  const [textA, textB] = [unique("تعليق أ"), unique("تعليق ب")];
  await Promise.all([comment(first, textA), comment(second, textB)]);
  await expect(first.getByText(textA)).toBeVisible();
  await expect(second.getByText(textB)).toBeVisible();
});

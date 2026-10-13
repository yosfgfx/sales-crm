import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { navigate, openIdea, pageAs, projectContext } from "./helpers";

const VIEWS = ["يومي", "الاجتماعات", "الفريق", "لوحة الشرف", "نظرة عامة", "الأفكار والمحتوى", "اعتمادات المدير", "استوديو التصميم", "تقويم التنفيذ", "أرشيف الأعمال", "التقارير الشهرية"];

async function audit(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  const result = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations.map((violation) => `${name} · ${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 3).map((node) => `${node.target.join(" ")} => ${(node.failureSummary || "").replace(/\s+/g, " ").slice(0, 220)}`).join(" | ")}`);
}

test("every main screen passes the automated accessibility check (L8, P6)", async ({ browser }) => {
  const problems: string[] = [];
  const login = await (await browser.newContext(projectContext())).newPage();
  await login.goto("/");
  problems.push(...await audit(login, "تسجيل الدخول"));
  const guide = await (await browser.newContext(projectContext())).newPage();
  await guide.goto("/guide");
  problems.push(...await audit(guide, "دليل الاستخدام"));
  const page = await pageAs(browser, "admin");
  for (const view of VIEWS) {
    await navigate(page, view);
    problems.push(...await audit(page, view));
  }
  await openIdea(page, "أبطال الموارد · قصص من فريقنا");
  problems.push(...await audit(page, "تفاصيل الفكرة"));
  await page.getByRole("button", { name: "إغلاق النافذة" }).click();
  const menu = page.getByRole("button", { name: "فتح القائمة الرئيسية" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "إدارة النظام" }).click();
  problems.push(...await audit(page, "إدارة النظام"));
  expect(problems, problems.join("\n")).toEqual([]);
});

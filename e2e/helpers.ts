import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import accounts from "./accounts.json";

export type Who = keyof typeof accounts;
export const ORIGIN = "http://localhost:3200";

export async function signIn(page: Page, who: Who, ip = "198.51.100.10") {
  await page.context().setExtraHTTPHeaders({ "x-nf-client-connection-ip": ip });
  const response = await page.request.post("/api/session", { data: { username: who, password: accounts[who] }, headers: { origin: ORIGIN } });
  expect(response.status(), `sign in as ${who}`).toBe(200);
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
}

const CONTEXT_KEYS = ["baseURL", "viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "locale", "timezoneId", "colorScheme"] as const;

export function projectContext(extra: BrowserContextOptions = {}): BrowserContextOptions {
  const use = test.info().project.use as Record<string, unknown>;
  return { ...Object.fromEntries(CONTEXT_KEYS.filter((key) => use[key] !== undefined).map((key) => [key, use[key]])), ...extra };
}

export async function pageAs(browser: Browser, who: Who, options: BrowserContextOptions = {}) {
  const context = await browser.newContext(projectContext(options));
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

export async function openIdea(page: Page, title: string) {
  const search = page.getByRole("searchbox", { name: "ابحث في كل الأفكار والأعمال" });
  if (await search.isVisible()) {
    await search.fill(title);
    await search.press("Enter");
  } else {
    await navigate(page, "الأفكار والمحتوى");
  }
  await page.getByRole("button", { name: new RegExp(escape(title)) }).first().click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function navigate(page: Page, label: string) {
  const target = page.getByRole("navigation", { name: "التنقل الرئيسي" }).getByRole("button", { name: new RegExp(`^${escape(label)}`) });
  const menu = page.getByRole("button", { name: "فتح القائمة الرئيسية" });
  if (!(await target.isVisible()) && (await menu.isVisible())) await menu.click();
  await target.click();
}

export const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const unique = (label: string) => `${label} ${Date.now().toString(36).slice(-5)}`;
export const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

export async function createIdea(page: Page, title: string, options: { quotes?: boolean } = {}) {
  await page.getByRole("button", { name: "فكرة جديدة" }).first().click();
  const dialog = page.getByRole("dialog", { name: "فكرة جديدة" });
  await dialog.getByLabel("عنوان الفكرة *").fill(title);
  await dialog.getByLabel("الإدارة المستفيدة أو جهة الطلب *").fill("إدارة الموارد البشرية");
  await dialog.getByLabel("وصف دقيق للفكرة والهدف منها").fill("رسالة توعوية قصيرة للموظفين.");
  await dialog.getByLabel("نص المحتوى *").fill("نص الشاشة الرئيسي.");
  await dialog.getByLabel("طريقة التنفيذ *").fill("تصميم ثابت للشاشات.");
  await dialog.getByRole("checkbox", { name: /واتساب/ }).uncheck();
  await dialog.getByRole("checkbox", { name: /البريد الداخلي/ }).uncheck();
  await dialog.getByLabel("موعد التسليم المطلوب").fill(daysFromNow(10));
  if (options.quotes) await dialog.getByRole("checkbox", { name: /يتطلب عروض أسعار/ }).check();
  await dialog.getByRole("button", { name: "حفظ الفكرة واستكمالها" }).click();
  const created = page.getByRole("dialog", { name: title });
  await expect(created).toBeVisible();
  return created;
}


import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createIdea, openIdea, pageAs, unique } from "../e2e/helpers";

const LIVE = "http://localhost:3300";
const FOLDER = "application/vnd.google-apps.folder";

async function driveToken(page: Page) {
  const response = await page.request.post(`${LIVE}/api/integrations/google`, { data: { action: "pickerToken" }, headers: { origin: LIVE } });
  expect(response.status()).toBe(200);
  return (await response.json()).accessToken as string;
}

async function children(page: Page, token: string, parent: string) {
  const query = new URLSearchParams({ q: `'${parent}' in parents and trashed = false`, fields: "files(id,name,mimeType,size)", pageSize: "100" });
  const response = await page.request.get(`https://www.googleapis.com/drive/v3/files?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200);
  return (await response.json()).files as { id: string; name: string; mimeType: string; size?: string }[];
}

test("live Google Drive: chunked upload survives a dropped chunk, delivery archives by month and company, repair restores a trashed file", async ({ browser }) => {
  const title = unique("اختبار حي");
  const big = Buffer.alloc(30 * 1024 * 1024, 7);
  const noura = await pageAs(browser, "noura");
  let idea = await createIdea(noura, title);
  await idea.getByRole("tab", { name: /الملفات/ }).click();
  let dropped = false;
  await noura.route("**/api/uploads/*", async (route) => {
    if (!dropped && route.request().method() === "PUT" && route.request().url().includes("offset=8388608")) { dropped = true; return route.abort("connectionreset"); }
    return route.continue();
  });
  await idea.locator('input[type="file"]').last().setInputFiles({ name: "مرجع كبير.bin", mimeType: "application/octet-stream", buffer: big });
  await idea.getByRole("button", { name: "رفع الملفات وحفظها" }).click();
  await expect(idea.getByRole("tab", { name: "الملفات (1)" })).toBeVisible({ timeout: 240_000 });
  expect(dropped).toBe(true);
  await idea.getByRole("button", { name: "إرسال للاعتماد" }).click();
  await expect(idea.getByText("بانتظار الاعتماد").first()).toBeVisible();

  const manager = await pageAs(browser, "manager");
  idea = await openIdea(manager, title);
  await idea.getByRole("button", { name: "اعتماد الفكرة" }).click();
  await expect(idea.getByText(/معتمد/).first()).toBeVisible();

  const designer = await pageAs(browser, "faisal");
  idea = await openIdea(designer, title);
  await idea.getByLabel("المصمم المسؤول").selectOption("faisal");
  await idea.getByRole("button", { name: "حفظ الجدولة" }).click();
  await idea.getByRole("button", { name: "بدء التصميم" }).click();
  await idea.getByRole("tab", { name: /الملفات/ }).click();
  await idea.locator('input[type="file"]').last().setInputFiles(path.join(__dirname, "../e2e/fixtures/final-screens.png"));
  await idea.getByRole("button", { name: "رفع الملفات وحفظها" }).click();
  await expect(idea.getByRole("tab", { name: "الملفات (2)" })).toBeVisible({ timeout: 60_000 });
  await idea.getByRole("button", { name: "إرسال التصميم للمراجعة" }).click();
  await idea.getByRole("button", { name: "تسجيل التسليم النهائي" }).click();
  await expect(idea.getByText("تم التسليم").first()).toBeVisible();

  const admin = await pageAs(browser, "admin");
  await expect.poll(async () => {
    const state = await (await admin.request.get(`${LIVE}/api/media`)).json();
    return state.data.ideas.find((item: { title: string }) => item.title === title)?.archive?.status;
  }, { timeout: 180_000, intervals: [5_000] }).toBe("done");
  await admin.reload();
  const archivedView = await openIdea(admin, title);
  await archivedView.getByRole("tab", { name: /الملفات/ }).click();
  await expect(archivedView.getByText(/أُرشف العمل في مجلد المشروع على Google Drive/)).toBeVisible();
  await archivedView.getByRole("button", { name: "إغلاق النافذة" }).click();

  const token = await driveToken(admin);
  const testRoot = JSON.parse(readFileSync(path.join(__dirname, "../.e2e-data/live-folder.json"), "utf8")).id as string;
  const years = await children(admin, token, testRoot);
  const year = years.find((item) => item.mimeType === FOLDER && /^\d{4}$/.test(item.name))!;
  expect(year, years.map((item) => item.name).join(", ")).toBeTruthy();
  const month = (await children(admin, token, year.id)).find((item) => item.mimeType === FOLDER && item.name.includes("أعمال"))!;
  expect(month).toBeTruthy();
  const company = (await children(admin, token, month.id)).find((item) => item.mimeType === FOLDER)!;
  expect(company.name).toContain("أعمال");
  const project = (await children(admin, token, company.id)).find((item) => item.mimeType === FOLDER && item.name.includes(title.split(" ").at(-1)!))!;
  expect(project, "project folder").toBeTruthy();
  const inside = await children(admin, token, project.id);
  expect(inside.map((item) => item.name).sort()).toEqual(expect.arrayContaining(["01 الموجز والمحتوى", "02 عروض الأسعار", "03 التصاميم النهائية", "ملخص المشروع.pdf"]));
  const brief = await children(admin, token, inside.find((item) => item.name === "01 الموجز والمحتوى")!.id);
  expect(brief.find((item) => item.name === "مرجع كبير.bin")?.size).toBe(String(big.length));
  const finals = await children(admin, token, inside.find((item) => item.name === "03 التصاميم النهائية")!.id);
  expect(finals.map((item) => item.name)).toContain("final-screens.png");
  const summary = await admin.request.get(`https://www.googleapis.com/drive/v3/files/${inside.find((item) => item.name === "ملخص المشروع.pdf")!.id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await summary.body()).subarray(0, 4).toString("latin1")).toBe("%PDF");

  const state = await (await admin.request.get(`${LIVE}/api/media`)).json();
  const archived = state.data.ideas.find((item: { title: string }) => item.title === title);
  const bigFile = archived.attachments.find((file: { name: string }) => file.name === "مرجع كبير.bin");
  const part = await admin.request.get(`${LIVE}${bigFile.url}`, { headers: { Range: "bytes=0-1048575" } });
  expect(part.status()).toBe(206);
  expect((await part.body()).length).toBe(1024 * 1024);

  const finalFile = finals.find((item) => item.name === "final-screens.png")!;
  const trashed = await admin.request.patch(`https://www.googleapis.com/drive/v3/files/${finalFile.id}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, data: { trashed: true } });
  expect(trashed.status()).toBe(200);
  const dialog = await openIdea(admin, title);
  await dialog.getByRole("tab", { name: /الملفات/ }).click();
  await dialog.getByRole("button", { name: "فحص ملفات الأرشيف" }).click();
  await expect(dialog.getByText("في سلة Drive")).toBeVisible();
  await dialog.getByRole("button", { name: "استعادة من السلة" }).click();
  await expect(dialog.getByText(/كلها في مكانها/)).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { navigate, openIdea, pageAs, unique } from "./helpers";

test("one line creates a task, the assignee sees it on their day, and the manager watches the live feed (smart tasks)", async ({ browser }) => {
  const noura = await pageAs(browser, "noura");
  await navigate(noura, "المهام");
  const title = unique("تجهيز نص الحملة");
  await noura.getByLabel("إضافة مهمة").first().fill(`@سارة ${title} بكرة`);
  await noura.getByLabel("إضافة مهمة").first().press("Enter");
  const row = noura.getByRole("listitem").filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText("موعده غداً")).toBeVisible();
  await row.getByRole("button", { name: "تفاصيل المهمة" }).click();
  await row.getByPlaceholder("اكتب تحديثاً قصيراً عن وضع المهمة…").fill("جاهز للمراجعة");
  await row.getByRole("button", { name: "تحديث" }).click();
  await expect(row.getByText("جاهز للمراجعة")).toBeVisible();

  const sara = await pageAs(browser, "sara");
  await expect(sara.getByRole("main").getByText(title).first()).toBeVisible();
  await navigate(sara, "المهام");
  const mine = sara.getByRole("listitem").filter({ hasText: title }).first();
  await mine.getByRole("button", { name: "لم تبدأ" }).click();
  await expect(mine.getByRole("button", { name: "جارية" })).toBeVisible();

  const manager = await pageAs(browser, "manager");
  await navigate(manager, "المهام");
  await expect(manager.getByText("حِمل الفريق")).toBeVisible();
  await expect(manager.getByText("آخر التحديثات")).toBeVisible();
  await expect(manager.getByText("جاهز للمراجعة").first()).toBeVisible();
  await manager.getByRole("button", { name: "متأخرة" }).click();
  await expect(manager.getByText(/لا توجد مهام متأخرة|متأخر/).first()).toBeVisible();
});

test("tasks live inside the idea and can be added from its tasks tab", async ({ browser }) => {
  const noura = await pageAs(browser, "noura");
  const idea = await openIdea(noura, "أبطال الموارد · قصص من فريقنا");
  await idea.getByRole("tab", { name: "المهام" }).click();
  const title = unique("كتابة مقدمة القصة");
  await idea.getByLabel("إضافة مهمة").fill(title);
  await idea.getByLabel("إضافة مهمة").press("Enter");
  await expect(idea.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  await expect(idea.getByText(/من [٠-٩]+ منجزة/)).toBeVisible();
});

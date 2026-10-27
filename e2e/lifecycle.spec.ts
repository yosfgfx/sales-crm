import path from "node:path";
import { expect, test } from "@playwright/test";
import { createIdea, daysFromNow, openIdea, pageAs, unique } from "./helpers";

test("an idea travels from content to delivery, and the designer never archives by hand", async ({ browser }, info) => {
  const title = unique(`مسار كامل ${info.project.name}`);
  const noura = await pageAs(browser, "noura");
  let idea = await createIdea(noura, title);
  await idea.getByRole("button", { name: "إرسال للاعتماد" }).click();
  await expect(idea.getByText("بانتظار الاعتماد").first()).toBeVisible();

  const manager = await pageAs(browser, "manager");
  idea = await openIdea(manager, title);
  await idea.getByRole("button", { name: "اعتماد الفكرة" }).click();
  await expect(idea.getByText(/معتمد/).first()).toBeVisible();

  const designer = await pageAs(browser, "faisal");
  idea = await openIdea(designer, title);
  await idea.getByLabel("المصمم المسؤول").selectOption({ label: /فيصل/ } as never).catch(async () => idea.getByLabel("المصمم المسؤول").selectOption("faisal"));
  await idea.getByLabel("بداية التنفيذ").fill(daysFromNow(1));
  await idea.getByLabel("موعد التسليم").fill(daysFromNow(9));
  await idea.getByRole("button", { name: "حفظ الجدولة" }).click();
  await expect(idea.getByText("مجدول").first()).toBeVisible();
  await idea.getByRole("button", { name: "بدء التصميم" }).click();
  await expect(idea.getByText("قيد التصميم").first()).toBeVisible();
  await idea.getByRole("tab", { name: /الملفات/ }).click();
  await idea.locator('input[type="file"]').last().setInputFiles(path.join(__dirname, "fixtures/final-screens.png"));
  await idea.getByRole("button", { name: "رفع الملفات وحفظها" }).click();
  await expect(idea.getByText("لم تُرفق النسخة النهائية")).toBeHidden();
  await expect(idea.getByRole("tab", { name: "الملفات (1)" })).toBeVisible();
  await idea.getByRole("button", { name: "تسجيل التسليم النهائي" }).click();
  await expect(idea.getByRole("status").filter({ hasText: "تم التسليم" })).toBeVisible();
  await expect(idea.getByText("تم التسليم").first()).toBeVisible();
  await expect(designer.getByRole("button", { name: /أرشف|أرشفة/ })).toHaveCount(0);

  await noura.reload();
  await noura.getByRole("button", { name: /فتح الإشعارات/ }).click();
  await expect(noura.getByRole("dialog", { name: "الإشعارات" }).getByText(new RegExp(title.split(" ").at(-1)!)).first()).toBeVisible();
});

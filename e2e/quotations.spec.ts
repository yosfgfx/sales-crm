import path from "node:path";
import { expect, test } from "@playwright/test";
import { createIdea, openIdea, pageAs, unique } from "./helpers";

test("quotations and vendor names stay with the owner and managers, never the designer (H1)", async ({ browser }, info) => {
  const title = unique(`عروض ${info.project.name}`);
  const vendor = unique("مطبعة الاختبار");
  const noura = await pageAs(browser, "noura");
  const idea = await createIdea(noura, title, { quotes: true });
  await idea.getByRole("tab", { name: /العروض/ }).click();
  await idea.getByRole("button", { name: "إضافة عرض سعر" }).click();
  const quote = noura.getByRole("dialog", { name: "إضافة عرض سعر" });
  await quote.getByLabel("اسم المورد").fill(vendor);
  await quote.getByLabel("نطاق العمل").fill("طباعة ملصقات A3");
  await quote.getByLabel("قيمة العرض بالريال").fill("4500");
  await quote.getByLabel("مدة التنفيذ بالأيام").fill("5");
  await quote.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures/quote.pdf"));
  await quote.getByRole("button", { name: "حفظ عرض السعر" }).click();
  await expect(idea.getByRole("tab", { name: "العروض (1)" })).toBeVisible();
  await expect(idea.getByText(vendor).first()).toBeVisible();

  const manager = await pageAs(browser, "manager");
  const managerView = await openIdea(manager, title);
  await managerView.getByRole("tab", { name: /العروض/ }).click();
  await expect(managerView.getByText(vendor).first()).toBeVisible();

  const designer = await pageAs(browser, "faisal");
  const designerView = await openIdea(designer, title);
  await expect(designerView.getByRole("tab", { name: "العروض (0)" })).toBeVisible();
  await designerView.getByRole("tab", { name: "سجل العمل" }).click();
  await expect(designerView.getByText(vendor)).toHaveCount(0);
  await designerView.getByRole("tab", { name: /الملفات/ }).click();
  await expect(designerView.getByText("quote.pdf")).toHaveCount(0);
});

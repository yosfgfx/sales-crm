import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { navigate, pageAs } from "./helpers";

test("older notifications load on demand and the guide is one click away (P1.5)", async ({ browser }, info) => {
  const db = new Client({ connectionString: "postgres://postgres:wasl-e2e-local@localhost:54329/wasl_e2e" });
  await db.connect();
  const prefix = `paged-${info.project.name}`;
  await db.query("delete from wasl.notifications where recipient_id = 'sara'");
  for (let n = 0; n < 70; n++) await db.query("insert into wasl.notifications (id, recipient_id, idea_id, type, title, body, created_at, read_at) values ($1, 'sara', 'idea-002', 'comment', $2, 'تعليق', now() - ($3 || ' hours')::interval, now())", [`${prefix}-${n}`, `إشعار رقم ${n}`, String(n)]);
  await db.end();

  const sara = await pageAs(browser, "sara");
  await sara.getByRole("button", { name: /فتح الإشعارات/ }).click();
  const panel = sara.getByRole("dialog", { name: "إشعارات الفريق" });
  await expect(panel.getByText("إشعار رقم 0 ·")).toBeVisible();
  await expect(panel.getByText("إشعار رقم 69 ·")).toHaveCount(0);
  await panel.getByRole("button", { name: "عرض إشعارات أقدم" }).click();
  await expect(panel.getByText("إشعار رقم 69 ·")).toBeVisible();
  await expect(panel.getByRole("button", { name: "عرض إشعارات أقدم" })).toHaveCount(0);
  await panel.getByRole("button", { name: "إغلاق النافذة" }).click();

  const menu = sara.getByRole("button", { name: "فتح القائمة الرئيسية" });
  if (await menu.isVisible()) await menu.click();
  await sara.getByRole("link", { name: "دليل الاستخدام" }).click();
  await expect(sara.getByRole("heading", { level: 1, name: "دليل استخدام وصل" })).toBeVisible();
  await sara.getByRole("link", { name: "العودة إلى مساحة العمل" }).click();
  await expect(sara.getByRole("heading", { level: 1, name: /مرحبًا سارة/ })).toBeVisible();
  await navigate(sara, "الأفكار والمحتوى");
});

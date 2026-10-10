import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { createIdea, pageAs, unique } from "./helpers";

test("the approval PowerPoint embeds the real image attached to the idea (H10)", async ({ browser }, info) => {
  const title = unique(`تصدير ${info.project.name}`);
  const noura = await pageAs(browser, "noura");
  const idea = await createIdea(noura, title);
  await idea.getByRole("tab", { name: /الملفات/ }).click();
  await idea.locator('input[type="file"]').last().setInputFiles(path.join(__dirname, "fixtures/final-screens.png"));
  await idea.getByRole("button", { name: "رفع الملفات وحفظها" }).click();
  await expect(idea.getByRole("tab", { name: "الملفات (1)" })).toBeVisible();
  await idea.getByRole("tab", { name: "عرض الاعتماد" }).click();
  const [download] = await Promise.all([noura.waitForEvent("download"), idea.getByRole("button", { name: "تنزيل PowerPoint" }).click()]);
  const file = await download.path();
  const zip = await JSZip.loadAsync(readFileSync(file!));
  const media = Object.keys(zip.files).filter((name) => name.startsWith("ppt/media/") && /\.(png|jpe?g)$/i.test(name));
  const dimensions = await Promise.all(media.map(async (name) => {
    const bytes = Buffer.from(await zip.file(name)!.async("uint8array"));
    return bytes.subarray(1, 4).toString("latin1") === "PNG" ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : name;
  }));
  expect(dimensions, `images in deck: ${dimensions.join(", ")}`).toContain("320x180");
});

/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads transpiled TypeScript through CommonJS. */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createHarness } = require("./helpers/harness.cjs");

let h, importer;
const HEADER = ["مقدم الفكرة", "ممول/غير ممول", "الهدف واضح", "الفكرة موضحة كاملاً", "نوع المحتوى", "Platform", "المرجع ", "الموافقة"];
const ROWS = [
  ["نورة الشهري", "غير ممول", "رفع الوعي بالسلامة", "حملة قصيرة عن السلامة في المكتب، مع نصائح يومية", "موشن جرافيك", "الشاشات، واتساب", "دليل السلامة", "موافق"],
  ["سارة", "ممول", "تعزيز الانتماء", "يوم مفتوح للموظفين مع هدايا رمزية", "تصميم", "البريد", "", ""],
  ["شخص غير موجود", "غير ممول", "هدف", "فكرة بلا قناة محددة\nعلى سطرين", "تقرير", "", "", ""],
];
const csv = (rows) => [HEADER, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
function upload(who, content, name, mode, options = {}) {
  const form = new FormData();
  form.set("file", new Blob([content]), name);
  form.set("mode", mode);
  form.set("options", JSON.stringify({ companyId: "hayyen", categoryId: "culture", dueDays: 10, ...options }));
  return importer.importIdeas(new Request(`${h.ORIGIN}/api/import/ideas`, { method: "POST", headers: { cookie: h.cookies[who], origin: h.ORIGIN }, body: form }));
}

before(async () => { h = await createHarness(); importer = require(path.join(h.root, "lib/server/idea-import.ts")); });
after(async () => h.close());

test("only administrators can import or delete demo data", async () => {
  await assert.rejects(upload("noura", csv(ROWS), "ideas.csv", "preview"), (error) => error.status === 403);
  await assert.rejects(importer.deleteDemoData(h.jsonRequest("/api/admin/demo-data", { confirm: "حذف البيانات التجريبية" }, { cookie: h.cookies.manager, method: "DELETE" })), (error) => error.status === 403);
});

test("preview reads the eight columns, suggests owners and maps type and channels", async () => {
  const preview = await upload("admin", csv(ROWS), "ideas.csv", "preview");
  assert.equal(preview.total, 3);
  const suggestions = Object.fromEntries(preview.proposers.map((proposer) => [proposer.name, proposer.suggestedOwnerId]));
  assert.deepEqual(suggestions, { "نورة الشهري": "noura", "سارة": "sara", "شخص غير موجود": null });
  assert.equal(preview.rows[0].workType, "motion");
  assert.deepEqual(preview.rows[0].channels, ["screens", "whatsapp"]);
  assert.deepEqual(preview.rows[1].channels, ["email"]);
  assert.equal(preview.rows[1].funded, true);
  assert.equal(preview.rows[2].platformGuessed, true);
  assert.equal(preview.rows[0].title, "حملة قصيرة عن السلامة في المكتب");
});

test("a file with wrong headers is rejected with the missing columns named", async () => {
  await assert.rejects(upload("admin", "اسم,فكرة\nا,ب", "bad.csv", "preview"), (error) => error.status === 422 && /أعمدة ناقصة/.test(error.message));
});

test("apply needs an owner for every proposer, creates drafts with source data, and skips repeats", async () => {
  await assert.rejects(upload("admin", csv(ROWS), "ideas.csv", "apply", { ownerMap: { "نورة الشهري": "noura", "سارة": "sara" } }), (error) => error.code === "IMPORT_OWNERS");
  const ownerMap = { "نورة الشهري": "noura", "سارة": "sara", "شخص غير موجود": "root" };
  const result = await upload("admin", csv(ROWS), "ideas.csv", "apply", { ownerMap });
  assert.equal(result.created.length, 3);
  const rows = (await h.pg.query("select owner_id, status::text as status, needs_quotes, company_id, source_proposal from wasl.ideas where id = any($1::text[]) order by code", [result.created.map((idea) => idea.id)])).rows;
  assert.deepEqual(rows.map((row) => row.owner_id), ["noura", "sara", "root"]);
  assert.ok(rows.every((row) => row.status === "draft" && row.company_id === "hayyen"));
  assert.deepEqual(rows.map((row) => row.needs_quotes), [false, true, false]);
  assert.equal(rows[0].source_proposal.sourceApproval, "موافق");
  assert.equal(rows[0].source_proposal.reference, "دليل السلامة");
  assert.equal(rows[2].source_proposal.proposerName, "شخص غير موجود");
  const again = await upload("admin", csv(ROWS), "ideas-copy.csv", "apply", { ownerMap });
  assert.equal(again.created.length, 0);
  assert.equal(again.skipped, 3);
  const preview = await upload("admin", csv(ROWS), "ideas.csv", "preview");
  assert.equal(preview.duplicates.length, 3);
});

test("optional columns fill company, department, category, work type and description", async () => {
  const header = [...HEADER, "الشركة المعنية بالنشر", "الإدارة المستفيدة أو جهة الطلب", "تصنيف المحتوى", "نوع العمل", "وصف دقيق للفكرة والهدف منها"];
  const rows = [["نورة الشهري", "غير ممول", "هدف عام", "فكرة كاملة عن التأمين الطبي", "تصميم", "البريد", "", "", "سيكيور لاين للتأمين", "الموارد البشرية", "التوعية", "موشن جرافيك", "وصف دقيق للهدف"]];
  const content = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  const preview = await upload("admin", content, "full.csv", "preview");
  assert.equal(preview.rows[0].companyId, "secureline");
  assert.equal(preview.rows[0].department, "الموارد البشرية");
  assert.equal(preview.rows[0].workType, "motion");
  assert.deepEqual(preview.rows[0].missing, []);
  const result = await upload("admin", content, "full.csv", "apply", { ownerMap: { "نورة الشهري": "noura" } });
  const idea = (await h.pg.query("select company_id, department, work_type::text as work_type, description from wasl.ideas where id = $1", [result.created[0].id])).rows[0];
  assert.deepEqual(idea, { company_id: "secureline", department: "الموارد البشرية", work_type: "motion", description: "وصف دقيق للهدف" });
  const partial = await upload("admin", csv([["سارة", "", "هدف", "فكرة ناقصة البيانات", "", "", "", ""]]), "partial.csv", "preview");
  assert.ok(partial.rows[0].missing.includes("الإدارة المستفيدة"));
});

test("Excel files are read the same way", async () => {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الأفكار");
  sheet.addRow(HEADER);
  sheet.addRow(["نورة الشهري", "غير ممول", "هدف من Excel", "فكرة جديدة من ملف Excel", "فيديو", "واتساب", "", ""]);
  const buffer = await workbook.xlsx.writeBuffer();
  const preview = await upload("admin", buffer, "ideas.xlsx", "preview");
  assert.equal(preview.total, 1);
  assert.equal(preview.rows[0].workType, "video");
  assert.deepEqual(preview.rows[0].channels, ["whatsapp"]);
});

test("demo deletion needs the exact phrase and removes only demo ideas", async () => {
  const before = await importer.demoDataSummary(h.getRequest("/api/admin/demo-data", h.cookies.admin));
  assert.equal(before.ideas, 18);
  await assert.rejects(importer.deleteDemoData(h.jsonRequest("/api/admin/demo-data", { confirm: "حذف" }, { cookie: h.cookies.admin, method: "DELETE" })), (error) => error.code === "CONFIRMATION_REQUIRED");
  const result = await importer.deleteDemoData(h.jsonRequest("/api/admin/demo-data", { confirm: "حذف البيانات التجريبية" }, { cookie: h.cookies.admin, method: "DELETE" }));
  assert.equal(result.deleted, 18);
  const left = (await h.pg.query("select count(*)::int as n, count(*) filter (where is_demo)::int as demo from wasl.ideas")).rows[0];
  assert.equal(left.demo, 0);
  assert.equal(left.n, 4);
  const orphans = (await h.pg.query("select count(*)::int as n from wasl.notifications where idea_id is not null and idea_id not in (select id from wasl.ideas)")).rows[0];
  assert.equal(orphans.n, 0);
});

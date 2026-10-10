import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { WORK_TYPE_LABELS, type Idea, type NewIdeaInput } from "@/data/media";
import { categoryFrom, channelsFrom, fingerprint, fundedFrom, matchCategory, matchCompany, matchWorkType, parseDelimited, rowsFromTable, suggestOwner, titleFrom, workTypeFrom, type ImportIssue, type ImportRow } from "@/lib/idea-import";
import { createMediaIdea, validateMediaData } from "@/lib/media-workflow";
import { requireAdministrator, requireUser } from "./auth";
import { database, type Queryable } from "./db";
import { assertSameOrigin, limitedBody, MediaServerError, readJson } from "./http";
import { loadReference, nextIdeaCode, persistIdea } from "./repository";

const FILE_LIMIT = 5 * 1024 * 1024;
type Options = { companyId: string; categoryId: string; dueDays: number; ownerMap: Record<string, string>; defaultOwnerId: string };

async function tableFrom(file: File): Promise<string[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.xlsx$/i.test(file.name)) {
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(bytes.buffer as ArrayBuffer); } catch { throw new MediaServerError("تعذّرت قراءة ملف Excel. احفظه بصيغة .xlsx أو CSV وأعد المحاولة.", 422, "IMPORT_UNREADABLE"); }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new MediaServerError("ملف Excel لا يحتوي ورقة عمل.", 422, "IMPORT_EMPTY");
    const table: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let column = 1; column <= Math.max(row.cellCount, 8); column++) cells.push(row.getCell(column).text?.trim() ?? "");
      table.push(cells);
    });
    return table;
  }
  try { return parseDelimited(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch (error) { throw new MediaServerError(error instanceof TypeError ? "ترميز الملف غير مدعوم. احفظه بصيغة CSV UTF-8 من Excel." : (error as Error).message, 422, "IMPORT_UNREADABLE"); }
}

async function existingFingerprints(q: Queryable) {
  const rows = await q.query<{ source_proposal: { proposerName?: string; originalConcept?: string; originalGoal?: string } | string }>("select source_proposal from wasl.ideas where source_proposal is not null");
  return new Set(rows.rows.map((row) => {
    const source = typeof row.source_proposal === "string" ? JSON.parse(row.source_proposal) : row.source_proposal;
    return fingerprint({ proposer: source.proposerName === "غير مذكور" ? "" : source.proposerName || "", concept: source.originalConcept || "", goal: source.originalGoal || "" });
  }));
}

function draftFor(row: ImportRow, options: Options, reference: Awaited<ReturnType<typeof loadReference>>, today: string) {
  const ownerId = options.ownerMap[row.proposer] || options.defaultOwnerId;
  const due = new Date(`${today}T12:00:00Z`);
  due.setUTCDate(due.getUTCDate() + Math.min(Math.max(Math.round(options.dueDays) || 14, 1), 365));
  const { channels } = channelsFrom(row.platform);
  const resolved = resolveFields(row, reference);
  const input: NewIdeaInput = {
    title: titleFrom(row), companyId: resolved.companyId || options.companyId, department: row.department, categoryId: resolved.categoryId || categoryFrom(row.contentType, reference.categories, options.categoryId), workType: resolved.workType,
    description: row.description || row.goal, content: row.concept, executionPlan: "", channels, ownerId, requestedAt: today, dueDate: due.toISOString().slice(0, 10), priority: "normal", needsQuotes: fundedFrom(row.funding),
  };
  return input;
}

function resolveFields(row: ImportRow, reference: Awaited<ReturnType<typeof loadReference>>) {
  return {
    companyId: matchCompany(row.company, reference.companies),
    categoryId: matchCategory(row.category, reference.categories),
    workType: matchWorkType(row.workType, WORK_TYPE_LABELS) || workTypeFrom(row.contentType),
  };
}

function missingFields(row: ImportRow, reference: Awaited<ReturnType<typeof loadReference>>) {
  const resolved = resolveFields(row, reference);
  const missing: string[] = [];
  if (!resolved.companyId) missing.push(row.company ? `الجهة «${row.company}» غير معروفة` : "الشركة المعنية بالنشر");
  if (!row.department) missing.push("الإدارة المستفيدة");
  if (!resolved.categoryId && !matchCategory(row.contentType, reference.categories)) missing.push(row.category ? `التصنيف «${row.category}» غير معروف` : "تصنيف المحتوى");
  if (!row.workType && !row.contentType) missing.push("نوع العمل");
  if (!row.description && !row.goal) missing.push("وصف الفكرة والهدف");
  return missing;
}

async function parseRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) throw new MediaServerError("اختر ملف الأفكار.", 415, "INVALID_CONTENT_TYPE");
  const form = await new Response(await limitedBody(request, FILE_LIMIT + 64 * 1024) as BodyInit, { headers: { "Content-Type": contentType } }).formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new MediaServerError("اختر ملف CSV أو Excel.");
  if (file.size > FILE_LIMIT) throw new MediaServerError("حجم ملف الأفكار أكبر من ٥ ميجابايت.", 413, "FILE_TOO_LARGE");
  let options: Partial<Options> = {};
  try { options = JSON.parse(String(form.get("options") || "{}")); } catch { throw new MediaServerError("إعدادات الاستيراد غير صالحة."); }
  return { file, options, mode: form.get("mode") === "apply" ? "apply" as const : "preview" as const };
}

export async function importIdeas(request: Request) {
  assertSameOrigin(request);
  const db = database();
  const actor = await requireUser(request, db);
  requireAdministrator(actor);
  const { file, options, mode } = await parseRequest(request);
  const table = await tableFrom(file);
  let parsed: { rows: ImportRow[]; issues: ImportIssue[] };
  try { parsed = rowsFromTable(table); } catch (error) { throw new MediaServerError((error as Error).message, 422, "IMPORT_HEADERS"); }
  const reference = await loadReference(db);
  const known = await existingFingerprints(db);
  const seen = new Set<string>();
  const duplicates = parsed.rows.filter((row) => { const key = fingerprint(row); const duplicate = known.has(key) || seen.has(key); seen.add(key); return duplicate; }).map((row) => row.row);
  const proposers = [...new Set(parsed.rows.map((row) => row.proposer))].map((name) => ({ name, count: parsed.rows.filter((row) => row.proposer === name).length, suggestedOwnerId: suggestOwner(name, reference.members) }));
  const preview = parsed.rows.map((row) => ({ row: row.row, proposer: row.proposer || "غير مذكور", title: titleFrom(row), workType: resolveFields(row, reference).workType, companyId: resolveFields(row, reference).companyId, department: row.department, categoryId: resolveFields(row, reference).categoryId, missing: missingFields(row, reference), channels: channelsFrom(row.platform).channels, platformGuessed: channelsFrom(row.platform).guessed, funded: fundedFrom(row.funding), duplicate: duplicates.includes(row.row), approval: row.approval }));
  if (mode === "preview") return { mode, fileName: file.name, total: parsed.rows.length, duplicates, issues: parsed.issues, proposers, rows: preview };

  const settings: Options = { companyId: String(options.companyId || ""), categoryId: String(options.categoryId || ""), dueDays: Number(options.dueDays || 14), ownerMap: options.ownerMap && typeof options.ownerMap === "object" ? options.ownerMap : {}, defaultOwnerId: String(options.defaultOwnerId || "") };
  if (!reference.companies.some((company) => company.id === settings.companyId) || !reference.categories.some((category) => category.id === settings.categoryId)) throw new MediaServerError("اختر الجهة والتصنيف الافتراضيين للاستيراد.", 422, "IMPORT_OPTIONS");
  const unassigned = proposers.filter((proposer) => !(settings.ownerMap[proposer.name] || settings.defaultOwnerId)).map((proposer) => proposer.name || "غير مذكور");
  if (unassigned.length) throw new MediaServerError(`حدد صاحب الفكرة في النظام لكل مقدم: ${unassigned.join("، ")}.`, 422, "IMPORT_OWNERS");
  const batchId = `import-${createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex").slice(0, 16)}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
  const created = await db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtext('wasl.import'))");
    const freshKnown = await existingFingerprints(tx);
    const result: Pick<Idea, "id" | "code" | "title" | "ownerId">[] = [];
    const inBatch = new Set<string>();
    for (const row of parsed.rows) {
      const key = fingerprint(row);
      if (freshKnown.has(key) || inBatch.has(key)) continue;
      inBatch.add(key);
      const now = new Date().toISOString();
      const slice = { ...reference, ideas: [], notifications: [] };
      const next = createMediaIdea(slice, actor, draftFor(row, settings, reference, today), { now, id: () => randomUUID() });
      const idea = next.ideas[0];
      idea.code = await nextIdeaCode(tx, Number(today.slice(0, 4)));
      idea.sourceProposal = { batchId, row: row.row, proposerName: row.proposer || "غير مذكور", funding: row.funding, originalGoal: row.goal, originalConcept: row.concept, sourceApproval: row.approval, contentType: row.contentType, platform: row.platform, reference: row.reference, fileName: file.name.slice(0, 300) };
      idea.history[0] = { ...idea.history[0], note: `استُوردت من الملف «${file.name.slice(0, 120)}»، الصف ${row.row}` };
      validateMediaData({ ...slice, ideas: [idea] });
      await persistIdea(tx, null, idea, actor.id);
      result.push({ id: idea.id, code: idea.code, title: idea.title, ownerId: idea.ownerId });
    }
    return result;
  });
  return { mode, fileName: file.name, created, skipped: parsed.rows.length - created.length, issues: parsed.issues };
}

export async function demoDataSummary(request: Request) {
  const db = database();
  requireAdministrator(await requireUser(request, db));
  const row = (await db.query<{ ideas: string; notifications: string }>("select (select count(*) from wasl.ideas where is_demo) as ideas, (select count(*) from wasl.notifications n join wasl.ideas i on i.id = n.idea_id where i.is_demo) as notifications")).rows[0];
  return { ideas: Number(row.ideas), notifications: Number(row.notifications) };
}

export async function deleteDemoData(request: Request) {
  assertSameOrigin(request);
  const db = database();
  const actor = await requireUser(request, db);
  requireAdministrator(actor);
  const body = await readJson(request, 1024) as { confirm?: string } | null;
  if (body?.confirm !== "حذف البيانات التجريبية") throw new MediaServerError("اكتب عبارة التأكيد كما هي لحذف البيانات التجريبية.", 422, "CONFIRMATION_REQUIRED");
  return db.transaction(async (tx) => {
    const ids = (await tx.query<{ id: string }>("select id from wasl.ideas where is_demo for update")).rows.map((row) => row.id);
    if (!ids.length) return { deleted: 0 };
    await tx.query("update wasl.quotations set attachment_id = null where idea_id = any($1::text[])", [ids]);
    await tx.query("delete from wasl.ideas where id = any($1::text[])", [ids]);
    return { deleted: ids.length };
  });
}

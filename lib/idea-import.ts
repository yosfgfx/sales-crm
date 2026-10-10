import type { Channel, Company, ContentCategory, TeamMember, WorkType } from "@/data/media";

export const IMPORT_HEADERS = ["مقدم الفكرة", "ممول/غير ممول", "الهدف واضح", "الفكرة موضحة كاملاً", "نوع المحتوى", "Platform", "المرجع", "الموافقة"] as const;
export const OPTIONAL_HEADERS = { company: "الشركة المعنية بالنشر", department: "الإدارة المستفيدة أو جهة الطلب", category: "تصنيف المحتوى", workType: "نوع العمل", description: "وصف دقيق للفكرة والهدف منها" } as const;
export const IMPORT_ROW_LIMIT = 500;

export interface ImportRow { row: number; proposer: string; funding: string; goal: string; concept: string; contentType: string; platform: string; reference: string; approval: string; company: string; department: string; category: string; workType: string; description: string }
export interface ImportIssue { row: number; message: string }

export function normalizeArabic(value: string) {
  return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627").replace(/\u0629/g, "\u0647").replace(/\u0649/g, "\u064A").replace(/\s+/g, " ").trim().toLowerCase();
}
const headerKey = (value: string) => normalizeArabic(value).replace(/[\s/]+/g, "");

export function parseDelimited(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  const firstLine = text.slice(0, text.indexOf("\n") < 0 ? undefined : text.indexOf("\n"));
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const records: string[][] = [];
  let record: string[] = [], field = "", quoted = false;
  const flush = () => { record.push(field); field = ""; if (record.some((cell) => cell.trim())) records.push(record); record = []; };
  for (let index = 0; index < text.length; index++) {
    const character = text[index], next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') { field += '"'; index++; }
      else if (character === '"' && (next === delimiter || next === "\r" || next === "\n" || next === undefined)) quoted = false;
      else field += character;
    } else if (character === '"' && !field) quoted = true;
    else if (character === delimiter) { record.push(field); field = ""; }
    else if (character === "\r" || character === "\n") { flush(); if (character === "\r" && next === "\n") index++; }
    else field += character;
  }
  if (quoted) throw new Error("يوجد حقل مقتبس غير مكتمل في الملف. افتحه في Excel واحفظه مجدداً.");
  if (field || record.length) flush();
  return records;
}

export function rowsFromTable(table: string[][]): { rows: ImportRow[]; issues: ImportIssue[] } {
  const [header, ...body] = table;
  if (!header) throw new Error("الملف فارغ.");
  const positions = IMPORT_HEADERS.map((name) => header.findIndex((cell) => headerKey(String(cell || "")) === headerKey(name)));
  const missing = IMPORT_HEADERS.filter((_, index) => positions[index] < 0);
  if (missing.length) throw new Error(`أعمدة ناقصة في الملف: ${missing.join("، ")}. يجب أن يحتوي الصف الأول على: ${IMPORT_HEADERS.join(" | ")}.`);
  if (body.length > IMPORT_ROW_LIMIT) throw new Error(`يمكن استيراد ${IMPORT_ROW_LIMIT} فكرة كحد أقصى في الملف الواحد.`);
  const optional = Object.fromEntries(Object.entries(OPTIONAL_HEADERS).map(([key, name]) => [key, header.findIndex((cell) => headerKey(String(cell || "")) === headerKey(name))])) as Record<keyof typeof OPTIONAL_HEADERS, number>;
  const rows: ImportRow[] = [], issues: ImportIssue[] = [];
  body.forEach((cells, index) => {
    const value = (column: number) => String(cells[positions[column]] ?? "").trim();
    const extra = (key: keyof typeof OPTIONAL_HEADERS) => (optional[key] < 0 ? "" : String(cells[optional[key]] ?? "").trim());
    const row: ImportRow = { row: index + 2, proposer: value(0), funding: value(1), goal: value(2), concept: value(3), contentType: value(4), platform: value(5), reference: value(6), approval: value(7), company: extra("company"), department: extra("department"), category: extra("category"), workType: extra("workType"), description: extra("description") };
    if (!row.concept && !row.goal) { issues.push({ row: row.row, message: "الصف بلا فكرة ولا هدف، ولن يُستورد." }); return; }
    if ([row.goal, row.concept, row.description].some((text) => text.length > 20000) || [row.proposer, row.funding, row.approval, row.contentType, row.platform, row.company, row.department, row.category, row.workType].some((text) => text.length > 300) || row.reference.length > 4000) { issues.push({ row: row.row, message: "أحد الحقول أطول من الحد المسموح، ولن يُستورد الصف." }); return; }
    rows.push(row);
  });
  return { rows, issues };
}

export function titleFrom(row: Pick<ImportRow, "concept" | "goal">) {
  const source = (row.concept || row.goal).replace(/\s+/g, " ").trim();
  const sentence = source.split(/[.!?\n:\u061F\u060C]/)[0].trim() || source;
  if (sentence.length <= 90) return sentence.replace(/[\s,.:;\u060C\u061B-]+$/, "");
  const cut = sentence.slice(0, 90);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 90).trim()}\u2026`;
}

export function workTypeFrom(contentType: string): WorkType {
  const text = normalizeArabic(contentType);
  if (/موشن|motion|انيميشن|رسوم متحركه/.test(text)) return "motion";
  if (/فيديو|مونتاج|video|ريلز|reel/.test(text)) return "video";
  if (/عرض تقديمي|عروض|presentation|بوربوينت|powerpoint/.test(text)) return "presentation";
  if (/تقرير|report/.test(text)) return "report";
  if (/مستند|دليل|كتيب|document|pdf/.test(text)) return "document";
  return "design";
}

export function channelsFrom(platform: string): { channels: Channel[]; guessed: boolean } {
  const text = normalizeArabic(platform);
  const channels: Channel[] = [];
  if (/شاش|screen|display/.test(text)) channels.push("screens");
  if (/واتس|whats/.test(text)) channels.push("whatsapp");
  if (/بريد|ايميل|email|e-mail|mail|اوتلوك|outlook/.test(text)) channels.push("email");
  return channels.length ? { channels, guessed: false } : { channels: ["screens", "whatsapp", "email"], guessed: true };
}

export function fundedFrom(funding: string) {
  const text = normalizeArabic(funding);
  if (/غير ممول|غير|not|^لا|^no$/.test(text)) return false;
  return /ممول|funded|نعم|yes/.test(text);
}

export function categoryFrom(contentType: string, categories: ContentCategory[], fallback: string) {
  const text = normalizeArabic(contentType);
  return categories.find((category) => text && (text.includes(normalizeArabic(category.name)) || normalizeArabic(category.name).includes(text)))?.id || fallback;
}

export function suggestOwner(proposer: string, members: TeamMember[]) {
  const candidates = members.filter((member) => member.active && (member.role === "content" || member.role === "admin" || member.role === "superadmin"));
  const name = normalizeArabic(proposer);
  if (!name) return null;
  const exact = candidates.filter((member) => normalizeArabic(member.name) === name);
  if (exact.length === 1) return exact[0].id;
  const first = name.split(" ")[0];
  const byFirst = candidates.filter((member) => normalizeArabic(member.name).split(" ")[0] === first);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

export const fingerprint = (row: Pick<ImportRow, "proposer" | "concept" | "goal">) => `${normalizeArabic(row.proposer)}|${normalizeArabic(row.concept || row.goal)}`;

const stem = (value: string) => normalizeArabic(value).split(" ").map((word) => word.replace(/^(\u0627\u0644|\u0644\u0644)/, "")).filter((word) => word.length >= 3);

export function matchCompany(value: string, companies: Company[]) {
  const words = stem(value);
  if (!words.length) return null;
  const scored = companies.map((company) => { const target = new Set([...stem(company.name), ...stem(company.shortName)]); return { id: company.id, score: words.filter((word) => target.has(word)).length }; }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return scored.length && (scored.length === 1 || scored[0].score > scored[1].score) ? scored[0].id : null;
}

export function matchCategory(value: string, categories: ContentCategory[]) {
  const text = normalizeArabic(value);
  if (!text) return null;
  return categories.find((category) => normalizeArabic(category.name) === text)?.id || categories.find((category) => text.includes(normalizeArabic(category.name)) || normalizeArabic(category.name).includes(text))?.id || null;
}

export function matchWorkType(value: string, labels: Record<WorkType, string>): WorkType | null {
  const text = normalizeArabic(value);
  if (!text) return null;
  const exact = (Object.entries(labels) as [WorkType, string][]).find(([, label]) => normalizeArabic(label) === text)?.[0];
  return exact || (/موشن|motion|انيميشن|فيديو|مونتاج|video|عرض|presentation|تقرير|report|مستند|دليل|document|تصميم|design/.test(text) ? workTypeFrom(value) : null);
}

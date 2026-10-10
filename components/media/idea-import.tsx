"use client";

import { useEffect, useState } from "react";
import { CHANNEL_LABELS, WORK_TYPE_LABELS, type Channel, type WorkType } from "@/data/media";
import { IMPORT_HEADERS, OPTIONAL_HEADERS } from "@/lib/idea-import";
import { useMediaStore } from "@/stores/media-store";
import { ActionButton, Icon, errorText } from "./ui";

interface Preview {
  fileName: string; total: number; duplicates: number[]; issues: { row: number; message: string }[];
  proposers: { name: string; count: number; suggestedOwnerId: string | null }[];
  rows: { row: number; proposer: string; title: string; workType: WorkType; companyId: string | null; department: string; categoryId: string | null; missing: string[]; channels: Channel[]; platformGuessed: boolean; funded: boolean; duplicate: boolean; approval: string }[];
}
const CONFIRMATION = "حذف البيانات التجريبية";

async function send<T>(input: string, init: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  let payload: T & { error?: string };
  try { payload = await response.json(); } catch { throw new Error("تعذّر الوصول إلى النظام الآن. أعد المحاولة بعد قليل."); }
  if (!response.ok) throw new Error(payload.error || "تعذّر تنفيذ الطلب.");
  return payload;
}

export default function IdeaImport() {
  const { data } = useMediaStore();
  const owners = data.members.filter((member) => member.active && ["content", "admin", "superadmin"].includes(member.role));
  const [file, setFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState(data.companies[0]?.id || "");
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id || "");
  const [dueDays, setDueDays] = useState(14);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [demo, setDemo] = useState<{ ideas: number; notifications: number } | null>(null);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    let active = true;
    send<{ ideas: number; notifications: number }>("/api/admin/demo-data", { cache: "no-store" }).then((value) => { if (active) setDemo(value); }, () => undefined);
    return () => { active = false; };
  }, []);

  const request = (mode: "preview" | "apply") => {
    const form = new FormData();
    form.set("file", file!);
    form.set("mode", mode);
    form.set("options", JSON.stringify({ companyId, categoryId, dueDays, ownerMap }));
    return send<Preview & { created?: { code: string; title: string }[]; skipped?: number }>("/api/import/ideas", { method: "POST", body: form });
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  };
  const importable = preview ? preview.rows.filter((row) => !row.duplicate).length : 0;
  const missingOwners = preview ? preview.proposers.filter((proposer) => !ownerMap[proposer.name]) : [];

  return (
    <div className="max-w-[60em] space-y-6">
      <section className="media-card space-y-5 p-6" aria-labelledby="import-heading">
        <div>
          <h2 id="import-heading">استيراد الأفكار من Excel أو CSV</h2>
          <p className="mt-1 text-sm text-[var(--soft)]">يجب أن يحتوي الصف الأول على الأعمدة: <bdi>{IMPORT_HEADERS.join(" | ")}</bdi>. تُنشأ كل فكرة مسودة باسم صاحبها، وتحتاج اعتماد الإدارة كالمعتاد. عمود «الموافقة» يُحفظ للتوثيق فقط.</p>
          <p className="mt-2 text-sm text-[var(--soft)]">أعمدة اختيارية تُعبّأ منها بيانات الفكرة إن وُجدت: <bdi>{Object.values(OPTIONAL_HEADERS).join(" | ")}</bdi>. ما لا يرد في الملف يُؤخذ من الاختيارات الافتراضية أدناه، وتُعلَّم الفكرة بما ينقصها لتكمله قبل إرسالها للاعتماد.</p>
          <a className="mt-2 inline-block text-sm text-[var(--primary)] underline underline-offset-4" href="/templates/wasl-ideas-template.csv" download="نموذج-أفكار-وصل.csv">تنزيل نموذج الملف بكل الأعمدة</a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="media-label">ملف الأفكار
            <input className="media-input mt-2" type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setMessage(""); }} />
          </label>
          <label className="media-label">مدة الإعداد الافتراضية بالأيام
            <input className="media-input mt-2" type="number" min={1} max={365} value={dueDays} onChange={(event) => setDueDays(Number(event.target.value))} />
          </label>
          <label className="media-label">الجهة الافتراضية
            <select className="media-input mt-2" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
          </label>
          <label className="media-label">التصنيف عند عدم مطابقة «نوع المحتوى»
            <select className="media-input mt-2" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </label>
        </div>
        <ActionButton disabled={!file || busy} onClick={() => run(async () => {
          const result = await request("preview");
          setPreview(result);
          setOwnerMap(Object.fromEntries(result.proposers.map((proposer) => [proposer.name, proposer.suggestedOwnerId || ""])));
        })}>
          <Icon name="file" className="size-4" />{busy && !preview ? "جارٍ قراءة الملف…" : "معاينة الملف"}
        </ActionButton>

        {preview && (
          <div className="space-y-5">
            <p className="text-sm">في الملف {preview.total} فكرة. ستُستورد {importable}، وتُتجاوز {preview.duplicates.length} مكررة سبق استيرادها.</p>
            {preview.issues.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-[var(--background)] p-4 text-sm">{preview.issues.map((issue) => <li key={issue.row}>الصف {issue.row}: {issue.message}</li>)}</ul>
            )}
            <div className="space-y-3">
              <h3 className="!text-base">أصحاب الأفكار في النظام</h3>
              {preview.proposers.map((proposer) => (
                <label key={proposer.name || "-"} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
                  <span>{proposer.name || "غير مذكور"} · {proposer.count} فكرة</span>
                  <select className="media-input !w-auto" value={ownerMap[proposer.name] || ""} onChange={(event) => setOwnerMap({ ...ownerMap, [proposer.name]: event.target.value })}>
                    <option value="">اختر صاحب الفكرة</option>
                    {owners.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[60em] text-sm">
                <thead className="bg-[var(--background)] text-start"><tr><th className="p-3 text-start">الصف</th><th className="p-3 text-start">العنوان</th><th className="p-3 text-start">مقدم الفكرة</th><th className="p-3 text-start">النوع</th><th className="p-3 text-start">الجهة</th><th className="p-3 text-start">الإدارة</th><th className="p-3 text-start">التصنيف</th><th className="p-3 text-start">القنوات</th><th className="p-3 text-start">ممولة</th><th className="p-3 text-start">ينقصها</th></tr></thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.row} className={`border-t border-[var(--border)] ${row.duplicate ? "opacity-50" : ""}`}>
                      <td className="p-3">{row.row}{row.duplicate ? " · مكررة" : ""}</td>
                      <td className="p-3">{row.title}</td>
                      <td className="p-3">{row.proposer}</td>
                      <td className="p-3">{WORK_TYPE_LABELS[row.workType]}</td>
                      <td className="p-3">{data.companies.find((company) => company.id === (row.companyId || companyId))?.shortName}{row.companyId ? "" : " (افتراضي)"}</td>
                      <td className="p-3">{row.department || "—"}</td>
                      <td className="p-3">{data.categories.find((category) => category.id === (row.categoryId || categoryId))?.name}{row.categoryId ? "" : " (افتراضي)"}</td>
                      <td className="p-3">{row.channels.map((channel) => CHANNEL_LABELS[channel]).join("، ")}{row.platformGuessed ? " (لم تُحدَّد)" : ""}</td>
                      <td className="p-3">{row.funded ? "نعم" : "لا"}</td>
                      <td className="p-3 text-xs text-[var(--soft)]">{row.missing.length ? row.missing.join("، ") : "مكتملة"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ActionButton primary disabled={busy || !importable || missingOwners.length > 0} onClick={() => run(async () => {
              const result = await request("apply");
              setMessage(`استُوردت ${result.created?.length ?? 0} فكرة كمسودات${result.skipped ? `، وتُركت ${result.skipped} فكرة مكررة دون استيراد` : ""}.`);
              setPreview(null); setFile(null);
              await useMediaStore.getState().refresh();
            })}>
              {busy ? "جارٍ الاستيراد…" : `استيراد ${importable} فكرة`}
            </ActionButton>
            {missingOwners.length > 0 && <p className="text-xs text-[var(--soft)]">اختر صاحب الفكرة لكل مقدم قبل الاستيراد.</p>}
          </div>
        )}
      </section>

      <section className="media-card space-y-4 p-6" aria-labelledby="demo-heading">
        <h2 id="demo-heading">البيانات التجريبية</h2>
        {demo && demo.ideas > 0 ? (
          <>
            <p className="text-sm">في النظام {demo.ideas} فكرة تجريبية مع سجلاتها ومرفقاتها وإشعاراتها. حذفها نهائي ولا يمكن التراجع عنه، ولا يمس الأفكار الحقيقية أو المستوردة.</p>
            <label className="media-label">للتأكيد اكتب: <bdi>{CONFIRMATION}</bdi>
              <input className="media-input mt-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            <ActionButton className="!text-[var(--danger)]" disabled={busy || confirmation !== CONFIRMATION} onClick={() => run(async () => {
              const result = await send<{ deleted: number }>("/api/admin/demo-data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: confirmation }) });
              setMessage(`حُذفت ${result.deleted} فكرة تجريبية.`);
              setDemo({ ideas: 0, notifications: 0 }); setConfirmation("");
              await useMediaStore.getState().refresh();
            })}>حذف البيانات التجريبية</ActionButton>
          </>
        ) : <p className="text-sm text-[var(--soft)]">لا توجد بيانات تجريبية.</p>}
      </section>

      {message && <div role="status" className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">{message}</div>}
    </div>
  );
}

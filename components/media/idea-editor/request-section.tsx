"use client";

import { WORK_TYPE_LABELS, type NewIdeaInput, type WorkType } from "@/data/media";
import type { MediaState } from "@/stores/media-store";
import { CompanyLogo } from "../company-logo";
import { ALL_COMPANIES_LABEL } from "@/data/media";

type Update = <K extends keyof NewIdeaInput>(key: K, value: NewIdeaInput[K]) => void;

export function RequestSection({
  form,
  update,
  store,
}: {
  form: NewIdeaInput;
  update: Update;
  store: MediaState;
}) {
  return (
    <section className="space-y-4">
      <h2>بيانات الطلب</h2>
      <label className="media-label">
        عنوان الفكرة <span className="text-[var(--danger)]">*</span>
        <input
          name="title"
          className="media-input mt-2"
          required
          maxLength={160}
          autoFocus
          value={form.title}
          placeholder="مثال: حملة الصحة النفسية للموظفين"
          onChange={(e) => update("title", e.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <CompanyPicker form={form} update={update} store={store} />
        <label className="media-label">
          الإدارة المستفيدة أو جهة الطلب *
          <input
            name="department"
            required
            list="departments"
            className="media-input mt-2"
            maxLength={120}
            value={form.department}
            placeholder="مثال: إدارة الموارد البشرية"
            onChange={(e) => update("department", e.target.value)}
          />
          <datalist id="departments">
            {[
              ...new Set([
                "إدارة الموارد البشرية",
                "إدارة الصحة والعافية المؤسسية",
                "إدارة تقنية المعلومات",
                "الإدارة التنفيذية",
                "إدارة التطوير المؤسسي",
                ...store.data.ideas.map((i) => i.department),
              ]),
            ].map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label className="media-label">
          تصنيف المحتوى
          <select
            className="media-input mt-2"
            value={form.categoryId}
            onChange={(e) => update("categoryId", e.target.value)}
          >
            {store.data.categories.filter((c) => c.active !== false || c.id === form.categoryId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="media-label">
          نوع العمل
          <select
            className="media-input mt-2"
            value={form.workType}
            onChange={(e) =>
              update("workType", e.target.value as WorkType)
            }
          >
            {Object.entries(WORK_TYPE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function CompanyPicker({
  form,
  update,
  store,
}: {
  form: NewIdeaInput;
  update: Update;
  store: MediaState;
}) {
  const selected = [...new Set([form.companyId, ...(form.companyIds || [])].filter(Boolean))];
  const available = store.data.companies.filter(
    (c) => c.active !== false || selected.includes(c.id),
  );
  const all = !!form.allCompanies;
  const setSelection = (ids: string[]) => {
    if (!ids.length) return;
    update("companyId", ids[0]);
    update("companyIds", ids.length > 1 ? ids : []);
  };
  const toggle = (id: string) => {
    if (all) {
      update("allCompanies", false);
      setSelection([id]);
      return;
    }
    setSelection(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );
  };
  return (
    <fieldset className="sm:col-span-2">
      <legend className="media-label">
        الشركات المعنية بالنشر{" "}
        <span className="font-normal text-[var(--soft)]">
          · اختر شركة أو أكثر
        </span>
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={all}
          onClick={() => update("allCompanies", !all)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors duration-200 ease-[var(--ease-power2-out)] ${all ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white hover:border-[#a99beb]"}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 drop-shadow-[0_2px_2px_rgba(32,39,60,.25)]">
            <defs>
              <linearGradient id="company-picker-all" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#A99BF5" />
                <stop offset="1" stopColor="#4B3CC0" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#company-picker-all)" />
            <path d="M2.5 12h19M12 2.2c3 3 3 16.6 0 19.6M12 2.2c-3 3-3 16.6 0 19.6" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.3" />
          </svg>
          {ALL_COMPANIES_LABEL}
        </button>
        {available.map((c) => {
          const on = !all && selected.includes(c.id);
          const primary = on && selected[0] === c.id && selected.length > 1;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-2 pe-4 text-sm transition-colors duration-200 ease-[var(--ease-power2-out)] ${on ? "border-[#a99beb] bg-[var(--accent)] font-medium text-[var(--primary)]" : all ? "border-[var(--border)] bg-[var(--background)] text-[var(--soft)]" : "border-[var(--border)] bg-white hover:border-[#a99beb]"}`}
            >
              <CompanyLogo companyId={c.id} decorative className="h-8 w-16 p-1" />
              <span>{c.shortName || c.name}</span>
              {primary && (
                <span className="rounded-md bg-white px-1.5 text-[11px] text-[var(--soft)]">
                  الرئيسية
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--soft)]">
        {all
          ? "سيظهر العمل لكل الشركات، ويُؤرشف في مجلد «أعمال كل الشركات»."
          : selected.length > 1
            ? `${selected.length.toLocaleString("ar-SA")} شركات مختارة. أول شركة اخترتها هي الرئيسية في الشعار والعرض.`
            : "اضغط على أي شركة لإضافتها، ويمكنك اختيار أكثر من شركة."}
      </p>
    </fieldset>
  );
}

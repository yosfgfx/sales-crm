"use client";

import { WORK_TYPE_LABELS, type NewIdeaInput, type WorkType } from "@/data/media";
import type { MediaState } from "@/stores/media-store";
import { CompanyLogo } from "../company-logo";

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
        <label className="media-label">
          الشركة المعنية بالنشر
          <select
            required
            className="media-input mt-2"
            value={form.companyId}
            onChange={(e) => update("companyId", e.target.value)}
          >
            {store.data.companies.filter((c) => c.active !== false || c.id === form.companyId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <CompanyLogo
            companyId={form.companyId}
            decorative
            className="mt-2 h-10 w-32"
          />
        </label>
        <label className="media-label">
          الإدارة المستفيدة أو جهة الطلب
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

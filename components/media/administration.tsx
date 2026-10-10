"use client";

import { useState, type FormEvent } from "react";
import { useMediaStore } from "@/stores/media-store";
import TeamSettings from "./team-settings";
import Image from "next/image";
import { ActionButton, Icon, errorText } from "./ui";
import { CompanyLogo } from "./company-logo";
import { companyBrand } from "@/lib/company-branding";
import Approvals from "./approvals";
import DriveIntegration from "./drive-integration";
import IdeaImport from "./idea-import";

export default function Administration({
  onOpenIdea,
  onNotice,
  initialTab,
  driveNotice,
}: {
  onOpenIdea: (id: string) => void;
  onNotice?: (message: string) => void;
  initialTab?: string;
  driveNotice?: string;
}) {
  const store = useMediaStore(),
    { data } = store;
  const [tab, setTab] = useState(initialTab === "integrations" ? "drive" : initialTab || "companies"),
    [company, setCompany] = useState(""),
    [category, setCategory] = useState("");
  const [settings, setSettings] = useState(data.settings),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null),
    [baseline, setBaseline] = useState(data.settings);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      let logoUrl = settings.logoUrl;
      if (tab === "identity" && logoFile) {
        const form = new FormData();
        form.append("files", logoFile);
        form.set("kind", "logo");
        const res = await fetch("/api/files", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok)
          throw new Error(json.error || "تعذر رفع الشعار. أعد المحاولة.");
        logoUrl = json.files[0].url;
        setSettings((prev) => ({ ...prev, logoUrl }));
        setLogoFile(null);
      }
      const patch = {
        departmentName: settings.departmentName,
        organizationName: settings.organizationName,
        logoUrl,
      };
      await store.updateSettings(patch, baseline);
      setBaseline(useMediaStore.getState().data.settings);
    }, "حُفظت هوية التقارير وإعدادات النظام.");
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {[
          { id: "approvals", label: "الاعتمادات" },
          { id: "companies", label: "الشركات" },
          { id: "categories", label: "تصنيفات المحتوى" },
          { id: "team", label: "الفريق والصلاحيات" },
          { id: "identity", label: "هوية التقارير" },
          { id: "drive", label: "أرشيف Google Drive" },
          { id: "import", label: "استيراد الأفكار" },
        ].map((t) => (
          <ActionButton
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setMessage("");
            }}
            aria-pressed={tab === t.id}
            className={
              tab === t.id
                ? "!bg-[var(--accent)] !text-[var(--primary)] !shadow-none"
                : ""
            }
          >
            {t.label}
          </ActionButton>
        ))}
      </div>
      {tab === "approvals" && (
        <Approvals
          data={data}
          onOpen={onOpenIdea}
          onNotice={onNotice}
          administration
        />
      )}
      {tab === "companies" && (
        <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
          <section className="media-card p-6">
            <h2>الجهات المعنية بالنشر</h2>
            <p className="mt-2 text-[var(--soft)]">
              تظهر هذه الشركات في كل فكرة، وفي التصفية والتقارير.
            </p>
            <div className="mt-6 divide-y divide-[var(--border)]">
              {data.companies.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-3 sm:w-auto sm:flex-row sm:items-center">
                    {companyBrand(c.id) ? (
                      <CompanyLogo
                        companyId={c.id}
                        companyName={c.name}
                        decorative
                        className="h-12 w-36"
                      />
                    ) : (
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-lg font-bold"
                        style={{ color: c.color }}
                      >
                        {c.initials}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium">{c.name}</span>
                      <span className="text-xs text-[var(--soft)]">
                        {data.ideas.filter((i) => i.companyId === c.id).length}{" "}
                        أعمال مرتبطة
                      </span>
                    </div>
                  </div>
                  <span className="media-badge media-badge-success">
                    متاحة للنشر
                  </span>
                </div>
              ))}
            </div>
          </section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await store.addCompany(company);
                setCompany("");
              }, "أُضيفت الشركة وأصبحت متاحة لجميع الأفكار.");
            }}
            className="media-card space-y-4 p-6"
          >
            <h2>إضافة شركة</h2>
            <label className="media-label">
              اسم الشركة
              <input
                required
                maxLength={150}
                className="media-input mt-2"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="الاسم الرسمي للشركة"
              />
            </label>
            <ActionButton type="submit" disabled={busy}>
              <Icon name="plus" className="size-4" />
              إضافة الشركة
            </ActionButton>
            <p className="text-xs text-[var(--soft)]">
              إدارة الشركات متاحة لمدير النظام فقط.
            </p>
          </form>
        </div>
      )}
      {tab === "categories" && (
        <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
          <section className="media-card p-6">
            <h2>تصنيفات المحتوى</h2>
            <p className="mt-2 text-[var(--soft)]">
              تصنيف كل فكرة يوضح ما تغطيه خطة النشر وما يحتاج مزيدًا من المحتوى.
            </p>
            <div className="mt-5 divide-y divide-[var(--border)]">
              {data.categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-4"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className="size-3 rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </span>
                  <span className="text-xs text-[var(--soft)]">
                    {data.ideas.filter((i) => i.categoryId === c.id).length}{" "}
                    أفكار
                  </span>
                </div>
              ))}
            </div>
          </section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await store.addCategory(category);
                setCategory("");
              }, "أُضيف التصنيف وأصبح متاحًا لخطة المحتوى.");
            }}
            className="media-card space-y-4 p-6"
          >
            <h2>إضافة تصنيف</h2>
            <label className="media-label">
              اسم التصنيف
              <input
                required
                maxLength={100}
                className="media-input mt-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="مثال: الاستدامة والمسؤولية"
              />
            </label>
            <ActionButton type="submit" disabled={busy}>
              <Icon name="plus" className="size-4" />
              إضافة التصنيف
            </ActionButton>
          </form>
        </div>
      )}
      {tab === "team" && <TeamSettings />}
      {tab === "drive" && <DriveIntegration notice={driveNotice} />}
      {tab === "import" && <IdeaImport />}
      {tab === "identity" && (
        <form
          onSubmit={saveSettings}
          className="media-card max-w-[60em] space-y-5 p-6"
        >
          {tab === "identity" ? (
            <>
              <h2>هوية التقرير الشهري</h2>
              <label className="media-label">
                اسم الإدارة
                <input
                  required
                  maxLength={150}
                  className="media-input mt-2"
                  value={settings.departmentName}
                  onChange={(e) =>
                    setSettings({ ...settings, departmentName: e.target.value })
                  }
                />
              </label>
              <label className="media-label">
                اسم المجموعة أو المؤسسة
                <input
                  required
                  maxLength={150}
                  className="media-input mt-2"
                  value={settings.organizationName}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      organizationName: e.target.value,
                    })
                  }
                />
              </label>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
                {settings.logoUrl && (
                  <Image
                    unoptimized
                    width={400}
                    height={120}
                    src={settings.logoUrl}
                    alt="شعار الإدارة الحالي"
                    className="mb-5 h-24 max-w-full object-contain"
                  />
                )}
                <label className="media-label">
                  رفع شعار الإدارة
                  <input
                    className="media-input mt-2"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  />
                </label>
                <p className="mt-2 text-xs text-[var(--soft)]">
                  صورة PNG أو JPG أو WebP بخلفية واضحة. يظهر الشعار على غلاف
                  التقرير وصفحاته.
                </p>
              </div>
            </>
          ) : null}
          <ActionButton type="submit" disabled={busy}>
            <Icon name="check" className="size-4" />
            {busy ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
          </ActionButton>
        </form>
      )}
      {message && (
        <div
          role="status"
          className="rounded-xl border border-[var(--border)] bg-white p-4"
        >
          {message}
        </div>
      )}
    </>
  );
}

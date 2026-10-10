"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import {
  CAMPAIGN_TYPES_CONFIG,
  type Campaign,
  type CampaignType,
} from "@/data/campaigns";
import { OWNERS } from "@/data/companies";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";

export default function NewCampaignDialog() {
  const open = useCompaniesStore((state) => state.newCampaignOpen);
  const setOpen = useCompaniesStore((state) => state.setNewCampaignOpen);
  const addCampaign = useCompaniesStore((state) => state.addCampaign);
  const companies = useCompaniesStore((state) => state.companies);
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<CampaignType>("advertising");
  const [entityId, setEntityId] = useState(companies[0]?.id || "");
  const [creativeLead, setCreativeLead] = useState(OWNERS[0]?.name || "");
  const [totalBudget, setTotalBudget] = useState("150000");
  const [overview, setOverview] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [dueDate, setDueDate] = useState("2026-10-30");
  const [eventDate, setEventDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const selectedEntity =
      companies.find((c) => c.id === entityId) || companies[0];

    const newCampaign: Campaign = {
      id: `camp-${Date.now()}`,
      title: title.trim(),
      type,
      entityId: selectedEntity?.id || "marketing-pr",
      entityName: selectedEntity?.name || "إدارة التسويق والعلاقات",
      creativeLead,
      stage: "idea",
      priority: "high",
      startDate,
      dueDate,
      eventDate: eventDate || undefined,
      progress: 10,
      totalBudget: Number(totalBudget) || 100000,
      spentBudget: 0,
      brief: {
        overview:
          overview.trim() ||
          "مقترح فكرة إبداعية جديدة للحملة والتغطية الإعلامية.",
        targetAudience: "الجمهور العام ومستفيدي المجموعة",
        keyDeliverables: [
          "مخرجات بصرية ورقمية رئيسية",
          "تغطية إعلامية ومحتوى ترويجي",
        ],
        distributionChannels: [
          "المنصات الرقمية وقنوات التواصل",
          "شاشات العرض والفعاليات",
        ],
      },
      quotations: [],
      budgetItems: [
        {
          id: `b-${Date.now()}-1`,
          category: type === "advertising" ? "media_ads" : "video",
          title: "الميزانية التشغيلية الأولية المعتمدة",
          allocated: Number(totalBudget) || 100000,
          spent: 0,
          notes: "تخصيص أولي للمشروع الإبداعي",
        },
      ],
      managerApproval: {
        status: "pending",
        managerName: "د. عبدالعزيز السالم",
        managerRole: "المشرف العام على قطاع الإعلام والاتصال",
        decisionDate: new Date().toISOString().split("T")[0],
        feedback: "فكرة جديدة تم تسجيلها وبانتظار دراسة عروض الأسعار.",
      },
      attachments: [],
    };

    addCampaign(newCampaign);
    setTitle("");
    setOverview("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[580px] bg-[#1a1a1a] border-line-strong p-5">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">
            {t.campaigns.newCampaign}
          </DialogTitle>
          <DialogDescription className="caption-style text-subtle">
            إدراج فكرة إبداعية، حملة إعلانية، أو تغطية إعلامية في المنظومة
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">
              عنوان الفكرة / الحملة الإبداعية:
            </label>
            <input
              type="text"
              placeholder="مثال: حملة إطلاق المنصة الرقمية، تغطية مؤتمر الاستثمار..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="h-9 rounded-md border border-[#333] bg-[#121212] px-3 text-xs text-foreground placeholder-[#666] focus:border-primary focus:outline-none"
            />
          </div>

          {/* Type & Entity */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                نوع العمل الإبداعي:
              </label>
              <select
                aria-label="Select campaign type"
                value={type}
                onChange={(e) => setType(e.target.value as CampaignType)}
                className="h-9 rounded-md border border-[#333] bg-[#121212] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="advertising">
                  {CAMPAIGN_TYPES_CONFIG.advertising.labelAr}
                </option>
                <option value="design">
                  {CAMPAIGN_TYPES_CONFIG.design.labelAr}
                </option>
                <option value="coverage">
                  {CAMPAIGN_TYPES_CONFIG.coverage.labelAr}
                </option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                الجهة المستفيدة:
              </label>
              <select
                aria-label="Select target entity"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="h-9 rounded-md border border-[#333] bg-[#121212] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lead & Budget */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                المسؤول الإبداعي:
              </label>
              <select
                aria-label="Select creative lead"
                value={creativeLead}
                onChange={(e) => setCreativeLead(e.target.value)}
                className="h-9 rounded-md border border-[#333] bg-[#121212] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                {OWNERS.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                الميزانية التقديرية (ر.س):
              </label>
              <input
                type="number"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                required
                className="h-9 rounded-md border border-[#333] bg-[#121212] px-3 text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                تاريخ البدء:
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 rounded-md border border-[#333] bg-[#121212] px-2 text-xs text-foreground focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                موعد التسليم:
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-8 rounded-md border border-[#333] bg-[#121212] px-2 text-xs text-foreground focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                موعد الفعالية (إن وجد):
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="h-8 rounded-md border border-[#333] bg-[#121212] px-2 text-xs text-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Overview / Brief */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">
              شرح الفكرة الإبداعية والأهداف:
            </label>
            <textarea
              placeholder="وصف مختصر لفكرة الحملة، الهدف الاستراتيجي، ومخرجات المحتوى والتغطية المتوقعة..."
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              rows={3}
              className="rounded-md border border-[#333] bg-[#121212] p-2.5 text-xs text-foreground placeholder-[#666] focus:border-primary focus:outline-none"
            />
          </div>

          <DialogFooter className="mt-2 flex items-center justify-end gap-2 border-t border-[#2e2e2e] pt-3">
            <DialogClose asChild>
              <Button variant="ghost" size="sm" type="button">
                إلغاء
              </Button>
            </DialogClose>
            <Button variant="primary" size="sm" type="submit">
              إضافة الفكرة وتدشين المسار
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

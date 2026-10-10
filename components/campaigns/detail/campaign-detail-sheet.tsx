"use client";

import { useMemo, useState } from "react";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { ScrollArea } from "@/components/_ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import {
  CAMPAIGN_STAGES_CONFIG,
  CAMPAIGN_TYPES_CONFIG,
  type BudgetItem,
  type BudgetItemCategory,
  type CampaignAttachment,
  type CampaignQuotation,
  type CampaignStage,
  type ManagerApprovalStatus,
} from "@/data/campaigns";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import { ManagerApprovalBadge } from "../campaigns-board";

type DetailTab = "brief" | "quotes" | "budget" | "approval" | "attachments";

export default function CampaignDetailSheet() {
  const detailOpen = useCompaniesStore((state) => state.campaignDetailOpen);
  const selectedCampaignId = useCompaniesStore(
    (state) => state.selectedCampaignId,
  );
  const campaigns = useCompaniesStore((state) => state.campaigns);
  const closeDetail = useCompaniesStore((state) => state.closeCampaignDetail);
  const updateCampaignStage = useCompaniesStore(
    (state) => state.updateCampaignStage,
  );
  const updateManagerApproval = useCompaniesStore(
    (state) => state.updateManagerApproval,
  );
  const addCampaignQuotation = useCompaniesStore(
    (state) => state.addCampaignQuotation,
  );
  const setQuotationStatus = useCompaniesStore(
    (state) => state.setQuotationStatus,
  );
  const addBudgetItem = useCompaniesStore((state) => state.addBudgetItem);
  const addAttachment = useCompaniesStore((state) => state.addAttachment);

  const { t, isRtl, formatMoneyLocale } = useTranslation();

  const [activeTab, setActiveTab] = useState<DetailTab>("brief");

  // New quote form state
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newQuoteAmount, setNewQuoteAmount] = useState("");
  const [newQuoteDuration, setNewQuoteDuration] = useState("14");
  const [newQuoteScope, setNewQuoteScope] = useState("");

  // New budget item form state
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [newBudgetCategory, setNewBudgetCategory] =
    useState<BudgetItemCategory>("video");
  const [newBudgetTitle, setNewBudgetTitle] = useState("");
  const [newBudgetAllocated, setNewBudgetAllocated] = useState("");

  // New attachment form state
  const [showAddAttachment, setShowAddAttachment] = useState(false);
  const [newAttachmentTitle, setNewAttachmentTitle] = useState("");
  const [newAttachmentCategory, setNewAttachmentCategory] =
    useState<CampaignAttachment["category"]>("brief");
  const [newAttachmentFileName, setNewAttachmentFileName] = useState("");

  // Manager feedback edit state
  const campaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId),
    [campaigns, selectedCampaignId],
  );

  const [feedbackDraft, setFeedbackDraft] = useState<string | null>(null);
  const [directiveNumberDraft, setDirectiveNumberDraft] = useState<string | null>(null);
  const [directiveNotesDraft, setDirectiveNotesDraft] = useState<string | null>(null);

  if (!campaign) return null;

  const feedbackText =
    feedbackDraft !== null
      ? feedbackDraft
      : (campaign.managerApproval.feedback || "");

  const directiveNumberText =
    directiveNumberDraft !== null
      ? directiveNumberDraft
      : (campaign.managerApproval.paymentDirective?.directiveNumber || "DIR-2026-8800");

  const directiveNotesText =
    directiveNotesDraft !== null
      ? directiveNotesDraft
      : (campaign.managerApproval.paymentDirective?.accountantNotes ||
        "يُصرف من بند ميزانية التسويق والإعلام المعتمد.");

  const typeConfig = CAMPAIGN_TYPES_CONFIG[campaign.type];

  // Handler for adding a new quotation
  const handleCreateQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName || !newQuoteAmount) return;

    const newQuote: CampaignQuotation = {
      id: `q-${Date.now()}`,
      vendorName: newVendorName,
      amount: Number(newQuoteAmount) || 0,
      durationDays: Number(newQuoteDuration) || 14,
      serviceScope:
        newQuoteScope || "نطاق أعمال وخدمات إنتاجية للتغطية والحملة",
      isRecommended: false,
      status: "pending",
      quoteDate: new Date().toISOString().split("T")[0],
      fileName: `Quote_${newVendorName.replace(/\s+/g, "_")}.pdf`,
    };

    addCampaignQuotation(campaign.id, newQuote);
    setShowAddQuote(false);
    setNewVendorName("");
    setNewQuoteAmount("");
    setNewQuoteScope("");
  };

  // Handler for adding a new budget item
  const handleCreateBudgetItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBudgetTitle || !newBudgetAllocated) return;

    const item: BudgetItem = {
      id: `b-${Date.now()}`,
      category: newBudgetCategory,
      title: newBudgetTitle,
      allocated: Number(newBudgetAllocated) || 0,
      spent: 0,
      notes: "بند ميزانية جديد تم إدراجه في خطة المشروع",
    };

    addBudgetItem(campaign.id, item);
    setShowAddBudget(false);
    setNewBudgetTitle("");
    setNewBudgetAllocated("");
  };

  // Handler for adding attachment
  const handleCreateAttachment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttachmentTitle) return;

    const attachment: CampaignAttachment = {
      id: `att-${Date.now()}`,
      title: newAttachmentTitle,
      category: newAttachmentCategory,
      fileName: newAttachmentFileName || `${newAttachmentTitle}.pdf`,
      fileType: "pdf",
      fileSize: "1.5 MB",
      uploadDate: new Date().toISOString().split("T")[0],
      uploadedBy: "فريق الإنتاج",
    };

    addAttachment(campaign.id, attachment);
    setShowAddAttachment(false);
    setNewAttachmentTitle("");
    setNewAttachmentFileName("");
  };

  // Handler for manager approval save
  const handleSaveApproval = (status: ManagerApprovalStatus) => {
    const recommendedQuote =
      campaign.quotations.find((q) => q.status === "approved") ||
      campaign.quotations[0];

    updateManagerApproval(campaign.id, {
      status,
      decisionDate: new Date().toISOString().split("T")[0],
      feedback: feedbackText,
      signature: "د. عبدالعزيز السالم / معتمد",
      paymentDirective: {
        directiveNumber: directiveNumberText,
        approvedAmount: recommendedQuote
          ? recommendedQuote.amount
          : campaign.totalBudget,
        authorizedDate: new Date().toISOString().split("T")[0],
        paymentMethod:
          "دفعة أولى 50% فوري، و50% بعد إجازة المخرجات والتغطية",
        accountantNotes: directiveNotesText,
        voucherFile: `Payment_Authorization_${directiveNumberText}.pdf`,
      },
    });
  };

  return (
    <Sheet open={detailOpen} onOpenChange={(open) => !open && closeDetail()}>
      <SheetContent
        side={isRtl ? "left" : "right"}
        className="w-full sm:w-[680px] sm:max-w-[680px] bg-[#161616] border-line-strong p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="border-b border-line-strong p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag tone={typeConfig.badgeTone} size="sm">
                {typeConfig.badgeAr}
              </Tag>
              <ManagerApprovalBadge status={campaign.managerApproval.status} />
            </div>

            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label="إغلاق">
                <svg
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </Button>
            </SheetClose>
          </div>

          <div>
            <SheetTitle className="text-base font-bold text-foreground">
              {campaign.title}
            </SheetTitle>
            <SheetDescription className="caption-style text-subtle">
              الجهة: {campaign.entityName} • المسؤول: {campaign.creativeLead}
            </SheetDescription>
          </div>

          {/* Quick Stage Progression */}
          <div className="flex items-center gap-2 pt-1">
            <span className="caption-style text-[#888]">المرحلة:</span>
            <select
              aria-label="Change campaign stage"
              value={campaign.stage}
              onChange={(e) =>
                updateCampaignStage(
                  campaign.id,
                  e.target.value as CampaignStage,
                )
              }
              className="rounded border border-[#333] bg-[#222] px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CAMPAIGN_STAGES_CONFIG.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.labelAr}
                </option>
              ))}
            </select>
            <span className="ms-auto caption-style text-emerald-400 font-semibold">
              الميزانية: {formatMoneyLocale(campaign.totalBudget)}{" "}
              {t.campaigns.currency}
            </span>
          </div>
        </SheetHeader>

        {/* Tab Navigation */}
        <div className="flex border-b border-line-strong bg-[#1a1a1a] px-4">
          <button
            onClick={() => setActiveTab("brief")}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "brief"
                ? "border-primary text-foreground"
                : "border-transparent text-subtle hover:text-foreground"
            }`}
          >
            الفكرة والموجز الإبداعي
          </button>
          <button
            onClick={() => setActiveTab("quotes")}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "quotes"
                ? "border-primary text-foreground"
                : "border-transparent text-subtle hover:text-foreground"
            }`}
          >
            عروض الأسعار
            <span className="rounded-full bg-[#2a2a2a] px-1.5 py-0.2 text-[10px] text-amber-400">
              {campaign.quotations.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("budget")}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === "budget"
                ? "border-primary text-foreground"
                : "border-transparent text-subtle hover:text-foreground"
            }`}
          >
            بنود الميزانية
          </button>
          <button
            onClick={() => setActiveTab("approval")}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "approval"
                ? "border-primary text-foreground"
                : "border-transparent text-subtle hover:text-foreground"
            }`}
          >
            اعتماد وتوجيه المدير
            {campaign.managerApproval.status === "pending" && (
              <span className="size-1.5 rounded-full bg-orange-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("attachments")}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "attachments"
                ? "border-primary text-foreground"
                : "border-transparent text-subtle hover:text-foreground"
            }`}
          >
            المرفقات
            <span className="rounded-full bg-[#2a2a2a] px-1.5 py-0.2 text-[10px] text-subtle">
              {campaign.attachments.length}
            </span>
          </button>
        </div>

        {/* Tab Body */}
        <ScrollArea className="flex-1 p-5">
          {/* TAB 1: Brief & Overview */}
          {activeTab === "brief" && (
            <div className="flex flex-col gap-5">
              <div className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-4 flex flex-col gap-2">
                <span className="text-xs font-semibold text-foreground">
                  شرح الفكرة الإبداعية والأهداف
                </span>
                <p className="text-xs text-subtle leading-relaxed">
                  {campaign.brief.overview}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-3.5 flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    الفئة المستهدفة
                  </span>
                  <p className="text-xs text-subtle">
                    {campaign.brief.targetAudience}
                  </p>
                </div>

                <div className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-3.5 flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    الجدول الزمني والفعالية
                  </span>
                  <p className="text-xs text-subtle">
                    تاريخ البدء: {campaign.startDate}
                    <br />
                    الموعد النهائي: {campaign.dueDate}
                    {campaign.eventDate && (
                      <>
                        <br />
                        موعد التغطية: {campaign.eventDate}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Key Deliverables */}
              <div className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-4 flex flex-col gap-2.5">
                <span className="text-xs font-semibold text-foreground">
                  المخرجات والتسليمات المطلوبة
                </span>
                <ul className="flex flex-col gap-1.5 text-xs text-subtle">
                  {campaign.brief.keyDeliverables.map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Distribution Channels */}
              <div className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-4 flex flex-col gap-2.5">
                <span className="text-xs font-semibold text-foreground">
                  قنوات النشر والتغطية
                </span>
                <div className="flex flex-wrap gap-2">
                  {campaign.brief.distributionChannels.map((channel, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-[#333] bg-[#282828] px-2.5 py-1 text-xs text-foreground"
                    >
                      {channel}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Quotations & Price Offers */}
          {activeTab === "quotes" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    عروض الأسعار المقدمة
                  </h3>
                  <p className="caption-style text-subtle">
                    مقارنة عروض استوديوهات الإنتاج والمصورين
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddQuote(true)}
                  className="text-xs gap-1"
                >
                  + إضافة عرض سعر
                </Button>
              </div>

              {/* Add Quote Inline Modal / Card */}
              {showAddQuote && (
                <form
                  onSubmit={handleCreateQuote}
                  className="rounded-lg border border-primary/40 bg-[#1c1c1c] p-4 flex flex-col gap-3 shadow-lg"
                >
                  <span className="text-xs font-bold text-foreground">
                    تسجيل عرض سعر جديد
                  </span>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="اسم المورد أو الاستوديو..."
                      value={newVendorName}
                      onChange={(e) => setNewVendorName(e.target.value)}
                      required
                      className="h-8 rounded border border-[#333] bg-[#111] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      placeholder="القيمة بالريال السعودي..."
                      value={newQuoteAmount}
                      onChange={(e) => setNewQuoteAmount(e.target.value)}
                      required
                      className="h-8 rounded border border-[#333] bg-[#111] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <input
                    type="number"
                    placeholder="مدة التنفيذ بالأيام (مثال: 15)..."
                    value={newQuoteDuration}
                    onChange={(e) => setNewQuoteDuration(e.target.value)}
                    className="h-8 rounded border border-[#333] bg-[#111] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  />

                  <textarea
                    placeholder="نطاق الخدمات والأعمال المقدمة..."
                    value={newQuoteScope}
                    onChange={(e) => setNewQuoteScope(e.target.value)}
                    rows={2}
                    className="rounded border border-[#333] bg-[#111] p-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddQuote(false)}
                      className="text-xs"
                    >
                      إلغاء
                    </Button>
                    <Button variant="primary" size="sm" type="submit" className="text-xs">
                      حفظ العرض
                    </Button>
                  </div>
                </form>
              )}

              {/* Quotations List */}
              <div className="flex flex-col gap-3">
                {campaign.quotations.length === 0 ? (
                  <div className="py-8 text-center text-xs text-subtle border border-dashed border-[#2f2f2f] rounded-lg">
                    لا توجد عروض أسعار مسجلة لهذه الفعالية بعد.
                  </div>
                ) : (
                  campaign.quotations.map((quote) => {
                    const isApproved = quote.status === "approved";
                    return (
                      <div
                        key={quote.id}
                        className={`rounded-lg border p-4 flex flex-col gap-2.5 transition-all ${
                          isApproved
                            ? "border-emerald-500/50 bg-emerald-500/5"
                            : "border-[#2c2c2c] bg-[#1f1f1f]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground">
                              {quote.vendorName}
                            </span>
                            {quote.isRecommended && (
                              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                                موصى به
                              </span>
                            )}
                          </div>

                          <span className="text-sm font-bold text-emerald-400">
                            {formatMoneyLocale(quote.amount)}{" "}
                            {t.campaigns.currency}
                          </span>
                        </div>

                        <p className="text-xs text-subtle leading-relaxed">
                          {quote.serviceScope}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#333] pt-2 text-xs text-[#888]">
                          <span className="flex items-center gap-1">
                            <svg
                              className="size-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            مدة الإنجاز: {quote.durationDays} يوم
                          </span>

                          <div className="flex items-center gap-2">
                            {isApproved ? (
                              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                                معتمد من المدير
                              </span>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  setQuotationStatus(
                                    campaign.id,
                                    quote.id,
                                    "approved",
                                  )
                                }
                                className="text-xs hover:text-emerald-400"
                              >
                                اختيار واعتماد
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Budget Items */}
          {activeTab === "budget" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    بنود الميزانية التفصيلية
                  </h3>
                  <p className="caption-style text-subtle">
                    تتبع المعتمد والمصروف والمتبقي
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddBudget(true)}
                  className="text-xs"
                >
                  + إضافة بند
                </Button>
              </div>

              {/* Add Budget Item Form */}
              {showAddBudget && (
                <form
                  onSubmit={handleCreateBudgetItem}
                  className="rounded-lg border border-primary/40 bg-[#1c1c1c] p-4 flex flex-col gap-3"
                >
                  <span className="text-xs font-bold text-foreground">
                    إضافة بند ميزانية جديد
                  </span>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <select
                      aria-label="Select budget item category"
                      value={newBudgetCategory}
                      onChange={(e) =>
                        setNewBudgetCategory(
                          e.target.value as BudgetItemCategory,
                        )
                      }
                      className="h-8 rounded border border-[#333] bg-[#111] px-2 text-xs text-foreground focus:outline-none"
                    >
                      <option value="video">إنتاج مرئي وتصوير</option>
                      <option value="design">تصاميم وهوية</option>
                      <option value="crew_equipment">معدات وطواقم</option>
                      <option value="media_ads">إعلانات ممولة</option>
                      <option value="licensing">تراخيص وموسيقى</option>
                    </select>

                    <input
                      type="text"
                      placeholder="اسم البند (مثال: تصوير درون معتمد)..."
                      value={newBudgetTitle}
                      onChange={(e) => setNewBudgetTitle(e.target.value)}
                      required
                      className="h-8 rounded border border-[#333] bg-[#111] px-2 text-xs text-foreground focus:outline-none focus:border-primary sm:col-span-2"
                    />
                  </div>

                  <input
                    type="number"
                    placeholder="المبلغ المخصص (ر.س)..."
                    value={newBudgetAllocated}
                    onChange={(e) => setNewBudgetAllocated(e.target.value)}
                    required
                    className="h-8 rounded border border-[#333] bg-[#111] px-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddBudget(false)}
                      className="text-xs"
                    >
                      إلغاء
                    </Button>
                    <Button variant="primary" size="sm" type="submit" className="text-xs">
                      حفظ البند
                    </Button>
                  </div>
                </form>
              )}

              {/* Budget Overview Card */}
              <div className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-subtle">إجمالي الميزانية المعتمدة:</span>
                  <span className="font-bold text-foreground">
                    {formatMoneyLocale(campaign.totalBudget)}{" "}
                    {t.campaigns.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-subtle">إجمالي المصروف الفعلي:</span>
                  <span className="font-bold text-emerald-400">
                    {formatMoneyLocale(campaign.spentBudget)}{" "}
                    {t.campaigns.currency}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#111] mt-1">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((campaign.spentBudget / (campaign.totalBudget || 1)) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Budget Table */}
              <div className="overflow-hidden rounded-lg border border-[#2c2c2c] bg-[#1e1e1e]">
                <table className="w-full text-start text-xs">
                  <thead className="bg-[#252525] text-subtle">
                    <tr>
                      <th className="p-2.5 text-start">البند</th>
                      <th className="p-2.5 text-start">المعتمد</th>
                      <th className="p-2.5 text-start">المصروف</th>
                      <th className="p-2.5 text-start">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a2a]">
                    {campaign.budgetItems.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {item.title}
                            </span>
                            {item.notes && (
                              <span className="text-[10px] text-[#777]">
                                {item.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 font-semibold text-foreground">
                          {formatMoneyLocale(item.allocated)}
                        </td>
                        <td className="p-2.5 text-emerald-400">
                          {formatMoneyLocale(item.spent)}
                        </td>
                        <td className="p-2.5 text-amber-400">
                          {formatMoneyLocale(
                            Math.max(0, item.allocated - item.spent),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: Manager Approval & Directives */}
          {activeTab === "approval" && (
            <div className="flex flex-col gap-5">
              <div className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    حالة الاعتماد والموافقة
                  </span>
                  <ManagerApprovalBadge
                    status={campaign.managerApproval.status}
                  />
                </div>
                <span className="caption-style text-subtle">
                  المدير المخول: {campaign.managerApproval.managerName} (
                  {campaign.managerApproval.managerRole})
                </span>
                {campaign.managerApproval.decisionDate && (
                  <span className="caption-style text-[#777]">
                    تاريخ القرار: {campaign.managerApproval.decisionDate}
                  </span>
                )}
              </div>

              {/* Feedback Textarea */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">
                  مرئيات وملاحظات المدير التوجيهية:
                </label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackDraft(e.target.value)}
                  rows={4}
                  placeholder="اكتب التوجيهات أو الملاحظات للمسؤول الإبداعي..."
                  className="rounded-lg border border-[#333] bg-[#1a1a1a] p-3 text-xs text-foreground placeholder-[#666] focus:border-primary focus:outline-none"
                />
              </div>

              {/* Payment Directive Card */}
              <div className="rounded-lg border border-[#2c2c2c] bg-[#1a1a1a] p-4 flex flex-col gap-3">
                <span className="text-xs font-semibold text-emerald-400">
                  توجيه أمر الصرف المالي والتعميد
                </span>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="caption-style text-subtle">
                      رقم التعميد:
                    </label>
                    <input
                      type="text"
                      value={directiveNumberText}
                      onChange={(e) => setDirectiveNumberDraft(e.target.value)}
                      className="h-8 rounded border border-[#333] bg-[#222] px-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="caption-style text-subtle">
                      ملاحظات المحاسبة:
                    </label>
                    <input
                      type="text"
                      value={directiveNotesText}
                      onChange={(e) => setDirectiveNotesDraft(e.target.value)}
                      className="h-8 rounded border border-[#333] bg-[#222] px-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#2c2c2c] pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSaveApproval("rejected")}
                  className="text-rose-400 hover:bg-rose-500/10"
                >
                  طلب تعديل وإعادة دراسة
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSaveApproval("conditional")}
                  className="text-amber-400 border-amber-500/30"
                >
                  اعتماد مشروط بملاحظات
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSaveApproval("approved")}
                >
                  اعتماد الحملة والميزانية
                </Button>
              </div>
            </div>
          )}

          {/* TAB 5: Attachments Hub */}
          {activeTab === "attachments" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    المرفقات والوثائق المضمنة
                  </h3>
                  <p className="caption-style text-subtle">
                    الموجز، عروض الأسعار، وتوجيهات الدفع والاعتماد
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddAttachment(true)}
                  className="text-xs"
                >
                  + إرفاق مستند
                </Button>
              </div>

              {/* Add Attachment Form */}
              {showAddAttachment && (
                <form
                  onSubmit={handleCreateAttachment}
                  className="rounded-lg border border-primary/40 bg-[#1c1c1c] p-4 flex flex-col gap-3"
                >
                  <span className="text-xs font-bold text-foreground">
                    تضمين مرفق جديد
                  </span>

                  <input
                    type="text"
                    placeholder="عنوان المستند أو المرفق..."
                    value={newAttachmentTitle}
                    onChange={(e) => setNewAttachmentTitle(e.target.value)}
                    required
                    className="h-8 rounded border border-[#333] bg-[#111] px-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <select
                      aria-label="Select attachment category"
                      value={newAttachmentCategory}
                      onChange={(e) =>
                        setNewAttachmentCategory(
                          e.target
                            .value as CampaignAttachment["category"],
                        )
                      }
                      className="h-8 rounded border border-[#333] bg-[#111] px-2 text-xs text-foreground focus:outline-none"
                    >
                      <option value="brief">موجز إبداعي (Brief)</option>
                      <option value="quotation">عرض سعر (Quote)</option>
                      <option value="mockup">مسودة وتصاميم (Mockup)</option>
                      <option value="directive">توجيه إداري (Directive)</option>
                      <option value="payment">إذن دفع وصرف (Payment)</option>
                    </select>

                    <input
                      type="text"
                      placeholder="اسم الملف (مثال: directive_doc.pdf)..."
                      value={newAttachmentFileName}
                      onChange={(e) => setNewAttachmentFileName(e.target.value)}
                      className="h-8 rounded border border-[#333] bg-[#111] px-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddAttachment(false)}
                      className="text-xs"
                    >
                      إلغاء
                    </Button>
                    <Button variant="primary" size="sm" type="submit" className="text-xs">
                      إرفاق
                    </Button>
                  </div>
                </form>
              )}

              {/* Attachment List */}
              <div className="flex flex-col gap-2.5">
                {campaign.attachments.length === 0 ? (
                  <div className="py-8 text-center text-xs text-subtle border border-dashed border-[#2f2f2f] rounded-lg">
                    لا توجد مرفقات مضمنة لهذا المشروع حتى الآن.
                  </div>
                ) : (
                  campaign.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="rounded-lg border border-[#2c2c2c] bg-[#1f1f1f] p-3 flex items-center justify-between gap-3 hover:bg-[#252525] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary font-bold text-xs">
                          {att.fileType.toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-foreground">
                            {att.title}
                          </span>
                          <span className="text-[11px] text-subtle">
                            {att.fileName} • {att.fileSize} • رافعه:{" "}
                            {att.uploadedBy}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          alert(`فتح أو معاينة المرفق: ${att.fileName}`)
                        }
                        className="text-xs"
                      >
                        معاينة
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

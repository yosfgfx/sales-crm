"use client";

import { useMemo, useState } from "react";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { ScrollArea } from "@/components/_ui/scroll-area";
import {
  CAMPAIGN_TYPES_CONFIG,
  type Campaign,
  type ManagerApprovalStatus,
  type PaymentDirective,
} from "@/data/campaigns";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import { ManagerApprovalBadge } from "./campaigns-board";

export default function ManagerApprovals() {
  const campaigns = useCompaniesStore((state) => state.campaigns);
  const updateManagerApproval = useCompaniesStore(
    (state) => state.updateManagerApproval,
  );
  const setQuotationStatus = useCompaniesStore(
    (state) => state.setQuotationStatus,
  );
  const openCampaignDetail = useCompaniesStore(
    (state) => state.openCampaignDetail,
  );
  const { t, formatMoneyLocale } = useTranslation();

  // Active campaign in directive review
  const [activeReviewId, setActiveReviewId] = useState<string>(
    campaigns.find((c) => c.managerApproval.status === "pending")?.id ||
      campaigns[0].id,
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === activeReviewId) || campaigns[0],
    [campaigns, activeReviewId],
  );

  // Manager feedback input state
  const [feedbackInput, setFeedbackInput] = useState<string>(
    selectedCampaign?.managerApproval.feedback || "",
  );
  const [directiveNumberInput, setDirectiveNumberInput] = useState<string>(
    selectedCampaign?.managerApproval.paymentDirective?.directiveNumber ||
      "DIR-2026-8800",
  );
  const [paymentMethodInput, setPaymentMethodInput] = useState<string>(
    selectedCampaign?.managerApproval.paymentDirective?.paymentMethod ||
      "دفعة أولى 50% فوري، و50% بعد إجازة المخرجات النهائية للتغطية",
  );
  const [accountantNotesInput, setAccountantNotesInput] = useState<string>(
    selectedCampaign?.managerApproval.paymentDirective?.accountantNotes ||
      "يُصرف من بند ميزانية التسويق والإعلام المعتمد للمجموعة لعام 2026.",
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Sync inputs when active campaign changes
  const handleSelectCampaign = (camp: Campaign) => {
    setActiveReviewId(camp.id);
    setFeedbackInput(camp.managerApproval.feedback);
    setDirectiveNumberInput(
      camp.managerApproval.paymentDirective?.directiveNumber ||
        "DIR-2026-8800",
    );
    setPaymentMethodInput(
      camp.managerApproval.paymentDirective?.paymentMethod ||
        "دفعة أولى 50% فوري، و50% بعد إجازة المخرجات النهائية للتغطية",
    );
    setAccountantNotesInput(
      camp.managerApproval.paymentDirective?.accountantNotes ||
        "يُصرف من بند ميزانية التسويق والإعلام المعتمد للمجموعة لعام 2026.",
    );
    setSavedNotice(null);
  };

  // Decisions
  const handleDecision = (status: ManagerApprovalStatus) => {
    if (!selectedCampaign) return;

    const recommendedQuote =
      selectedCampaign.quotations.find((q) => q.status === "approved") ||
      selectedCampaign.quotations.find((q) => q.isRecommended) ||
      selectedCampaign.quotations[0];

    const approvedAmount = recommendedQuote
      ? recommendedQuote.amount
      : selectedCampaign.totalBudget;

    const paymentDirective: PaymentDirective = {
      directiveNumber: directiveNumberInput,
      approvedAmount,
      authorizedDate: new Date().toISOString().split("T")[0],
      paymentMethod: paymentMethodInput,
      accountantNotes: accountantNotesInput,
      voucherFile: `Payment_Authorization_${directiveNumberInput}.pdf`,
    };

    updateManagerApproval(selectedCampaign.id, {
      status,
      decisionDate: new Date().toISOString().split("T")[0],
      feedback: feedbackInput,
      signature: "د. عبدالعزيز السالم / المشرف العام",
      paymentDirective: status !== "rejected" ? paymentDirective : undefined,
    });

    setSavedNotice(
      status === "approved"
        ? "تم اعتماد الحملة وإصدار أمر الصرف المالي بنجاح."
        : status === "conditional"
          ? "تم توثيق الاعتماد المشروط مع حفظ المرئيات التوجيهية."
          : "تم تسجيل طلب التعديلات وإعادته للمسؤول الإبداعي.",
    );

    setTimeout(() => setSavedNotice(null), 4000);
  };

  // KPI Calculations
  const pendingCount = useMemo(
    () =>
      campaigns.filter((c) => c.managerApproval.status === "pending").length,
    [campaigns],
  );
  const approvedCount = useMemo(
    () =>
      campaigns.filter((c) => c.managerApproval.status === "approved").length,
    [campaigns],
  );
  const conditionalCount = useMemo(
    () =>
      campaigns.filter((c) => c.managerApproval.status === "conditional").length,
    [campaigns],
  );
  const totalApprovedDisbursements = useMemo(() => {
    return campaigns
      .filter((c) => c.managerApproval.paymentDirective)
      .reduce(
        (acc, c) =>
          acc + (c.managerApproval.paymentDirective?.approvedAmount || 0),
        0,
      );
  }, [campaigns]);

  // All budget items aggregated across campaigns
  const masterBudgetItems = useMemo(() => {
    const list: {
      campaignTitle: string;
      category: string;
      title: string;
      allocated: number;
      spent: number;
      remaining: number;
    }[] = [];

    campaigns.forEach((camp) => {
      camp.budgetItems.forEach((b) => {
        list.push({
          campaignTitle: camp.title,
          category: b.category,
          title: b.title,
          allocated: b.allocated,
          spent: b.spent,
          remaining: Math.max(0, b.allocated - b.spent),
        });
      });
    });

    return list;
  }, [campaigns]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Top Executive Stats */}
      <div className="grid grid-cols-2 gap-3 border-b border-line-strong p-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <span className="caption-style text-orange-400 font-medium">
            {t.campaigns.pendingDirectives}
          </span>
          <span className="h1-style text-[22px] font-bold text-orange-400">
            {pendingCount}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <span className="caption-style text-emerald-400 font-medium">
            {t.campaigns.approvedDirectives}
          </span>
          <span className="h1-style text-[22px] font-bold text-emerald-400">
            {approvedCount}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <span className="caption-style text-amber-400 font-medium">
            {t.campaigns.conditionalDirectives}
          </span>
          <span className="h1-style text-[22px] font-bold text-amber-400">
            {conditionalCount}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-[#2b2b2b] bg-[#1a1a1a]/80 p-3">
          <span className="caption-style text-subtle font-medium">
            {t.campaigns.totalAuthorizedBudget}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="h1-style text-[22px] font-bold text-foreground">
              {formatMoneyLocale(totalApprovedDisbursements)}
            </span>
            <span className="caption-style text-subtle">{t.campaigns.currency}</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left Column: Campaigns Pending Review List */}
        <div className="w-full border-b border-line-strong lg:w-[380px] lg:border-b-0 lg:border-e flex flex-col shrink-0">
          <div className="flex items-center justify-between border-b border-line-strong bg-[#1f1f1f] p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">
              طلبات الاعتماد والعروض
            </h2>
            <span className="caption-style text-[#777]">
              {campaigns.length} ملفات مسجلة
            </span>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col divide-y divide-[#262626]">
              {campaigns.map((camp) => {
                const isSelected = camp.id === activeReviewId;
                const typeConfig = CAMPAIGN_TYPES_CONFIG[camp.type];

                return (
                  <div
                    key={camp.id}
                    onClick={() => handleSelectCampaign(camp)}
                    className={`flex cursor-pointer flex-col gap-2 p-3.5 transition-colors ${
                      isSelected
                        ? "bg-[#252525] border-s-4 border-s-primary"
                        : "hover:bg-[#1e1e1e]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <Tag tone={typeConfig.badgeTone} size="sm">
                        {typeConfig.badgeAr}
                      </Tag>
                      <ManagerApprovalBadge status={camp.managerApproval.status} />
                    </div>

                    <h3 className="line-clamp-2 text-sm font-medium text-foreground">
                      {camp.title}
                    </h3>

                    <div className="flex items-center justify-between text-xs text-subtle">
                      <span className="truncate max-w-[180px]">
                        {camp.entityName}
                      </span>
                      <span className="font-semibold text-emerald-400">
                        {formatMoneyLocale(camp.totalBudget)}{" "}
                        {t.campaigns.currency}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#777]">
                      <span>المسؤول: {camp.creativeLead.split(" ")[0]}</span>
                      <span>{camp.quotations.length} عروض أسعار</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right Column: Executive Approval & Directives Workspace */}
        {selectedCampaign ? (
          <ScrollArea className="flex-1 p-5">
            <div className="mx-auto flex max-w-4xl flex-col gap-6">
              {/* Campaign Header Profile */}
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-line-strong bg-[#1c1c1c] p-4 shadow-sm">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag
                      tone={
                        CAMPAIGN_TYPES_CONFIG[selectedCampaign.type].badgeTone
                      }
                      size="sm"
                    >
                      {CAMPAIGN_TYPES_CONFIG[selectedCampaign.type].badgeAr}
                    </Tag>
                    <ManagerApprovalBadge
                      status={selectedCampaign.managerApproval.status}
                    />
                    <span className="caption-style text-subtle">
                      الجهة: {selectedCampaign.entityName}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-foreground">
                    {selectedCampaign.title}
                  </h2>
                  <p className="text-xs text-subtle leading-relaxed max-w-2xl">
                    {selectedCampaign.brief.overview}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openCampaignDetail(selectedCampaign.id)}
                    className="text-xs"
                  >
                    فتح ملف المشروع بالكامل
                  </Button>
                  <span className="text-xs text-emerald-400 font-semibold">
                    الميزانية الإجمالية:{" "}
                    {formatMoneyLocale(selectedCampaign.totalBudget)}{" "}
                    {t.campaigns.currency}
                  </span>
                </div>
              </div>

              {/* Success Notification Alert */}
              {savedNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                  <svg
                    className="size-5 shrink-0 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>{savedNotice}</span>
                </div>
              )}

              {/* Price Offers & Quotations Evaluation */}
              <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-[#1c1c1c] p-4">
                <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-2">
                  <div className="flex items-center gap-2">
                    <svg
                      className="size-4 text-amber-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <h3 className="text-sm font-semibold text-foreground">
                      {t.campaigns.quotationsTitle}
                    </h3>
                  </div>
                  <span className="caption-style text-subtle">
                    مقارنة عروض الموردين والاستوديوهات
                  </span>
                </div>

                {selectedCampaign.quotations.length === 0 ? (
                  <div className="py-4 text-center text-xs text-subtle">
                    لم يتم تسجيل عروض أسعار حتى الآن في هذه المرحلة.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {selectedCampaign.quotations.map((quote) => {
                      const isApproved = quote.status === "approved";
                      return (
                        <div
                          key={quote.id}
                          className={`flex flex-col gap-2 rounded-lg border p-3.5 transition-all ${
                            isApproved
                              ? "border-emerald-500/50 bg-emerald-500/5 shadow-inner"
                              : quote.isRecommended
                                ? "border-amber-500/40 bg-amber-500/5"
                                : "border-[#2c2c2c] bg-[#222]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-foreground">
                              {quote.vendorName}
                            </span>
                            {quote.isRecommended && (
                              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                موصى به
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-subtle leading-normal">
                            {quote.serviceScope}
                          </p>

                          <div className="mt-1 flex items-baseline justify-between border-t border-[#333] pt-2">
                            <div className="flex flex-col">
                              <span className="caption-style text-[#888]">
                                القيمة الإجمالية
                              </span>
                              <span className="text-base font-bold text-emerald-400">
                                {formatMoneyLocale(quote.amount)}{" "}
                                {t.campaigns.currency}
                              </span>
                            </div>
                            <span className="text-xs text-subtle">
                              مدة التنفيذ: {quote.durationDays} يوم
                            </span>
                          </div>

                          {/* Approval Actions per quote */}
                          <div className="mt-2 flex items-center justify-between gap-2 pt-1">
                            <span className="caption-style text-[#888] flex items-center gap-1">
                              <svg
                                className="size-3"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {quote.fileName}
                            </span>

                            <div className="flex gap-1.5">
                              {isApproved ? (
                                <span className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300">
                                  العرض المعتمد من المدير
                                </span>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    setQuotationStatus(
                                      selectedCampaign.id,
                                      quote.id,
                                      "approved",
                                    )
                                  }
                                  className="text-xs hover:text-emerald-400"
                                >
                                  اعتماد هذا العرض
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Executive Directives, Feedback & Sign-off Form */}
              <div className="flex flex-col gap-4 rounded-xl border border-line-strong bg-[#1c1c1c] p-5">
                <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-3">
                  <div className="flex items-center gap-2">
                    <svg
                      className="size-5 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        مرئيات وتوجيهات الإدارة التنفيذية
                      </h3>
                      <p className="caption-style text-subtle">
                        توقيع: {selectedCampaign.managerApproval.managerName} (
                        {selectedCampaign.managerApproval.managerRole})
                      </p>
                    </div>
                  </div>

                  <span className="caption-style rounded bg-[#272727] px-2 py-1 text-subtle">
                    تاريخ القرار: {selectedCampaign.managerApproval.decisionDate}
                  </span>
                </div>

                {/* Directives Input Field */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground">
                    نص المرئيات والتوجيهات الإدارية:
                  </label>
                  <textarea
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                    rows={4}
                    placeholder={t.campaigns.feedbackPlaceholder}
                    className="w-full rounded-lg border border-[#333] bg-[#171717] p-3 text-xs text-foreground placeholder-[#666] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Payment Directive Section (Disbursement Authorization) */}
                <div className="rounded-lg border border-[#2e2e2e] bg-[#181818] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
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
                          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      توجيه وأمر الصرف المالي (إذن الدفع والتعميد)
                    </span>
                    <span className="caption-style text-[#777]">
                      إذن معتمد للإدارة المالية
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className="caption-style text-subtle">
                        {t.campaigns.directiveNumber}:
                      </label>
                      <input
                        type="text"
                        value={directiveNumberInput}
                        onChange={(e) => setDirectiveNumberInput(e.target.value)}
                        className="h-8 rounded-md border border-[#333] bg-[#222] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="caption-style text-subtle">
                        {t.campaigns.paymentMethod}:
                      </label>
                      <input
                        type="text"
                        value={paymentMethodInput}
                        onChange={(e) => setPaymentMethodInput(e.target.value)}
                        className="h-8 rounded-md border border-[#333] bg-[#222] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="caption-style text-subtle">
                      {t.campaigns.accountantNotes}:
                    </label>
                    <input
                      type="text"
                      value={accountantNotesInput}
                      onChange={(e) => setAccountantNotesInput(e.target.value)}
                      className="h-8 rounded-md border border-[#333] bg-[#222] px-2.5 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* Final Decision Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#2b2b2b] pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDecision("rejected")}
                    className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    {t.campaigns.rejectBtn}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDecision("conditional")}
                    className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    {t.campaigns.conditionalBtn}
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleDecision("approved")}
                    className="gap-1.5 shadow-lg shadow-primary/20"
                  >
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {t.campaigns.approveBtn}
                  </Button>
                </div>
              </div>

              {/* Master Budget Breakdown Table */}
              <div className="flex flex-col gap-3 rounded-xl border border-line-strong bg-[#1c1c1c] p-5">
                <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    بنود الميزانية المعتمدة والمصروفات لكافة المشاريع
                  </h3>
                  <span className="caption-style text-subtle">
                    {masterBudgetItems.length} بنود تشغيلية
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-[#242424] text-subtle">
                      <tr>
                        <th className="p-2.5 text-start">الحملة</th>
                        <th className="p-2.5 text-start">البند والمهمة</th>
                        <th className="p-2.5 text-start">المعتمد</th>
                        <th className="p-2.5 text-start">المصروف</th>
                        <th className="p-2.5 text-start">المتبقي</th>
                        <th className="p-2.5 text-start">نسبة الصرف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a2a]">
                      {masterBudgetItems.map((item, index) => {
                        const pct = Math.round(
                          (item.spent / (item.allocated || 1)) * 100,
                        );
                        return (
                          <tr key={index} className="hover:bg-[#222]">
                            <td className="p-2.5 font-medium text-foreground truncate max-w-[150px]">
                              {item.campaignTitle}
                            </td>
                            <td className="p-2.5 text-subtle">{item.title}</td>
                            <td className="p-2.5 font-semibold text-foreground">
                              {formatMoneyLocale(item.allocated)}{" "}
                              {t.campaigns.currency}
                            </td>
                            <td className="p-2.5 text-emerald-400">
                              {formatMoneyLocale(item.spent)}{" "}
                              {t.campaigns.currency}
                            </td>
                            <td className="p-2.5 text-amber-400">
                              {formatMoneyLocale(item.remaining)}{" "}
                              {t.campaigns.currency}
                            </td>
                            <td className="p-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-8">{pct}%</span>
                                <div className="h-1.5 w-16 rounded-full bg-[#161616] overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-subtle">
            اختر حملة لمراجعة عروض الأسعار وإصدار التوجيهات
          </div>
        )}
      </div>
    </div>
  );
}

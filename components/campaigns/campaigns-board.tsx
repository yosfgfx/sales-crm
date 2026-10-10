"use client";

import { useMemo, useState } from "react";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { ScrollArea } from "@/components/_ui/scroll-area";
import {
  CAMPAIGN_STAGES_CONFIG,
  CAMPAIGN_TYPES_CONFIG,
  type Campaign,
  type CampaignStage,
} from "@/data/campaigns";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";

export default function CampaignsBoard() {
  const campaigns = useCompaniesStore((state) => state.campaigns);
  const openCampaignDetail = useCompaniesStore(
    (state) => state.openCampaignDetail,
  );
  const updateCampaignStage = useCompaniesStore(
    (state) => state.updateCampaignStage,
  );
  const setNewCampaignOpen = useCompaniesStore(
    (state) => state.setNewCampaignOpen,
  );
  const campaignFilterType = useCompaniesStore(
    (state) => state.campaignFilterType,
  );
  const setCampaignFilterType = useCompaniesStore(
    (state) => state.setCampaignFilterType,
  );
  const campaignViewMode = useCompaniesStore((state) => state.campaignViewMode);
  const setCampaignViewMode = useCompaniesStore(
    (state) => state.setCampaignViewMode,
  );
  const { t, formatMoneyLocale, isRtl } = useTranslation();

  const [selectedLead, setSelectedLead] = useState<string>("all");

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((camp) => {
      if (
        campaignFilterType !== "all" &&
        camp.type !== campaignFilterType
      ) {
        return false;
      }
      if (selectedLead !== "all" && camp.creativeLead !== selectedLead) {
        return false;
      }
      return true;
    });
  }, [campaigns, campaignFilterType, selectedLead]);

  const uniqueLeads = useMemo(() => {
    return Array.from(new Set(campaigns.map((c) => c.creativeLead)));
  }, [campaigns]);

  // Statistics
  const totalBudget = useMemo(
    () => campaigns.reduce((acc, c) => acc + c.totalBudget, 0),
    [campaigns],
  );
  const pendingApprovalsCount = useMemo(
    () =>
      campaigns.filter((c) => c.managerApproval.status === "pending").length,
    [campaigns],
  );
  const avgProgress = useMemo(() => {
    if (campaigns.length === 0) return 0;
    return Math.round(
      campaigns.reduce((acc, c) => acc + c.progress, 0) / campaigns.length,
    );
  }, [campaigns]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Top Strategic KPI Metrics Banner */}
      <div className="grid grid-cols-2 gap-3 border-b border-line-strong p-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-lg border border-[#2b2b2b] bg-[#1a1a1a]/70 p-3 shadow-inner">
          <span className="caption-style text-subtle flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-primary" />
            {t.campaigns.statsTotal}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="h1-style text-[20px] font-bold text-foreground">
              {campaigns.length}
            </span>
            <span className="caption-style text-subtle">
              {campaigns.filter((c) => c.type === "advertising").length} إعلان •{" "}
              {campaigns.filter((c) => c.type === "coverage").length} تغطية
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-[#2b2b2b] bg-[#1a1a1a]/70 p-3 shadow-inner">
          <span className="caption-style text-subtle flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-emerald-500" />
            {t.campaigns.statsBudget}
          </span>
          <div className="flex items-baseline gap-1">
            <span className="h1-style text-[20px] font-bold text-emerald-400">
              {formatMoneyLocale(totalBudget)}
            </span>
            <span className="caption-style text-subtle">{t.campaigns.currency}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-[#2b2b2b] bg-[#1a1a1a]/70 p-3 shadow-inner">
          <span className="caption-style text-subtle flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-amber-500" />
            {t.campaigns.statsPending}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="h1-style text-[20px] font-bold text-amber-400">
              {pendingApprovalsCount}
            </span>
            <span className="caption-style text-amber-500/80">
              تتطلب توجيه واعتماد
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-[#2b2b2b] bg-[#1a1a1a]/70 p-3 shadow-inner">
          <span className="caption-style text-subtle flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-teal-500" />
            {t.campaigns.statsAvgProgress}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="h1-style text-[20px] font-bold text-teal-400">
              {avgProgress}%
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${avgProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong px-4 py-3">
        {/* Type Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={campaignFilterType === "all" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setCampaignFilterType("all")}
            className="rounded-full text-xs"
          >
            {t.campaigns.allTypes}
          </Button>
          <Button
            variant={
              campaignFilterType === "advertising" ? "primary" : "secondary"
            }
            size="sm"
            onClick={() => setCampaignFilterType("advertising")}
            className="rounded-full text-xs gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-blue-400" />
            {t.campaigns.typeAdvertising}
          </Button>
          <Button
            variant={campaignFilterType === "design" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setCampaignFilterType("design")}
            className="rounded-full text-xs gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-purple-400" />
            {t.campaigns.typeDesign}
          </Button>
          <Button
            variant={
              campaignFilterType === "coverage" ? "primary" : "secondary"
            }
            size="sm"
            onClick={() => setCampaignFilterType("coverage")}
            className="rounded-full text-xs gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-teal-400" />
            {t.campaigns.typeCoverage}
          </Button>

          {/* Lead Filter Dropdown */}
          <select
            aria-label="Filter by creative lead"
            value={selectedLead}
            onChange={(e) => setSelectedLead(e.target.value)}
            className="ms-2 h-7 rounded-md border border-[#333] bg-[#222] px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">كافة المسؤولين الإبداعيين</option>
            {uniqueLeads.map((lead) => (
              <option key={lead} value={lead}>
                {lead}
              </option>
            ))}
          </select>
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-[#333] bg-[#1e1e1e] p-0.5">
            <Button
              variant={campaignViewMode === "board" ? "subtle" : "ghost"}
              size="sm"
              onClick={() => setCampaignViewMode("board")}
              className="h-6 px-2 text-xs"
            >
              {t.campaigns.viewBoard}
            </Button>
            <Button
              variant={campaignViewMode === "list" ? "subtle" : "ghost"}
              size="sm"
              onClick={() => setCampaignViewMode("list")}
              className="h-6 px-2 text-xs"
            >
              {t.campaigns.viewList}
            </Button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setNewCampaignOpen(true)}
            className="gap-1.5 font-medium shadow-md"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            {t.campaigns.newCampaign}
          </Button>
        </div>
      </div>

      {/* Main Content: Board View vs List View */}
      {campaignViewMode === "board" ? (
        <ScrollArea className="flex-1 p-4">
          <div className="flex min-w-max gap-4 pb-4">
            {CAMPAIGN_STAGES_CONFIG.map((stageConfig) => {
              const stageCampaigns = filteredCampaigns.filter(
                (c) => c.stage === stageConfig.id,
              );
              const stageTotalBudget = stageCampaigns.reduce(
                (acc, c) => acc + c.totalBudget,
                0,
              );

              return (
                <div
                  key={stageConfig.id}
                  className="flex w-[320px] shrink-0 flex-col rounded-xl border border-line-strong bg-[#191919]/90 shadow-sm"
                >
                  {/* Column Header */}
                  <div className="flex flex-col gap-1 border-b border-[#282828] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag tone={stageConfig.tone} size="sm">
                          {stageCampaigns.length}
                        </Tag>
                        <h2 className="text-sm font-semibold text-foreground">
                          {isRtl ? stageConfig.labelAr : stageConfig.labelEn}
                        </h2>
                      </div>
                      <span className="caption-style text-subtle">
                        {formatMoneyLocale(stageTotalBudget)}{" "}
                        {t.campaigns.currency}
                      </span>
                    </div>
                    <span className="caption-style text-[#777] text-[11px] line-clamp-1">
                      {stageConfig.descriptionAr}
                    </span>
                  </div>

                  {/* Column Body / Cards */}
                  <div className="flex flex-col gap-2.5 p-2.5">
                    {stageCampaigns.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#2f2f2f] py-8 text-center">
                        <span className="caption-style text-[#666]">
                          لا توجد مشاريع في هذه المرحلة
                        </span>
                      </div>
                    ) : (
                      stageCampaigns.map((camp) => (
                        <CampaignCard
                          key={camp.id}
                          campaign={camp}
                          onOpen={() => openCampaignDetail(camp.id)}
                          onMoveStage={(newStage) =>
                            updateCampaignStage(camp.id, newStage)
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        /* List View */
        <ScrollArea className="flex-1 p-4">
          <div className="overflow-hidden rounded-xl border border-line-strong bg-[#1a1a1a]">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-line-strong bg-[#202020] text-xs text-subtle">
                <tr>
                  <th className="p-3 text-start">الحملة / المشروع الإبداعي</th>
                  <th className="p-3 text-start">النوع</th>
                  <th className="p-3 text-start">الجهة المستفيدة</th>
                  <th className="p-3 text-start">المسؤول الإبداعي</th>
                  <th className="p-3 text-start">المرحلة الحالية</th>
                  <th className="p-3 text-start">الميزانية المعتمدة</th>
                  <th className="p-3 text-start">نسبة الإنجاز</th>
                  <th className="p-3 text-start">حالة اعتماد المدير</th>
                  <th className="p-3 text-end">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262626]">
                {filteredCampaigns.map((camp) => (
                  <tr
                    key={camp.id}
                    onClick={() => openCampaignDetail(camp.id)}
                    className="cursor-pointer transition-colors hover:bg-[#232323]"
                  >
                    <td className="p-3 font-medium text-foreground">
                      <div className="flex flex-col">
                        <span>{camp.title}</span>
                        <span className="text-[11px] text-subtle">
                          {camp.brief.keyDeliverables.length} مخرجات رئيسية
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <Tag
                        tone={CAMPAIGN_TYPES_CONFIG[camp.type].badgeTone}
                        size="sm"
                      >
                        {CAMPAIGN_TYPES_CONFIG[camp.type].badgeAr}
                      </Tag>
                    </td>
                    <td className="p-3 text-subtle">{camp.entityName}</td>
                    <td className="p-3 text-foreground">{camp.creativeLead}</td>
                    <td className="p-3">
                      <span className="caption-style rounded bg-[#2a2a2a] px-2 py-1 text-foreground">
                        {
                          CAMPAIGN_STAGES_CONFIG.find(
                            (s) => s.id === camp.stage,
                          )?.labelAr
                        }
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-emerald-400">
                      {formatMoneyLocale(camp.totalBudget)}{" "}
                      {t.campaigns.currency}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{camp.progress}%</span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${camp.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <ManagerApprovalBadge status={camp.managerApproval.status} />
                    </td>
                    <td className="p-3 text-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCampaignDetail(camp.id);
                        }}
                      >
                        عرض التفاصيل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// Single Card Component in Kanban
function CampaignCard({
  campaign,
  onOpen,
  onMoveStage,
}: {
  campaign: Campaign;
  onOpen: () => void;
  onMoveStage: (stage: CampaignStage) => void;
}) {
  const { formatMoneyLocale, t } = useTranslation();
  const typeConfig = CAMPAIGN_TYPES_CONFIG[campaign.type];

  return (
    <div
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col gap-2.5 rounded-lg border border-[#2e2e2e] bg-[#202020] p-3 shadow-md transition-all duration-200 hover:border-primary/60 hover:bg-[#252525] hover:shadow-lg"
    >
      {/* Top row: Type Tag & Manager Approval Badge */}
      <div className="flex items-center justify-between gap-1">
        <Tag tone={typeConfig.badgeTone} size="sm">
          {typeConfig.badgeAr}
        </Tag>
        <ManagerApprovalBadge status={campaign.managerApproval.status} />
      </div>

      {/* Title */}
      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary-foreground">
        {campaign.title}
      </h3>

      {/* Entity & Lead */}
      <div className="flex flex-col gap-1 text-[12px] text-subtle">
        <div className="flex items-center gap-1.5">
          <svg
            className="size-3 shrink-0 text-[#888]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <span className="truncate">{campaign.entityName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg
            className="size-3 shrink-0 text-[#888]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className="truncate">{campaign.creativeLead}</span>
        </div>
      </div>

      {/* Progress & Budget */}
      <div className="mt-1 flex flex-col gap-1.5 border-t border-[#2a2a2a] pt-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-emerald-400">
            {formatMoneyLocale(campaign.totalBudget)} {t.campaigns.currency}
          </span>
          <span className="text-subtle font-medium">{campaign.progress}% إنجاز</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#161616]">
          <div
            className="h-full bg-gradient-to-r from-primary to-teal-400 rounded-full"
            style={{ width: `${campaign.progress}%` }}
          />
        </div>
      </div>

      {/* Meta indicators: Quotations & Attachments */}
      <div className="flex items-center justify-between pt-1 text-[11px] text-subtle">
        <div className="flex items-center gap-2">
          {campaign.quotations.length > 0 && (
            <span
              className="flex items-center gap-1 text-amber-400"
              title="عروض الأسعار"
            >
              <svg className="size-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path
                  fillRule="evenodd"
                  d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
                  clipRule="evenodd"
                />
              </svg>
              {campaign.quotations.length} عروض
            </span>
          )}
          {campaign.attachments.length > 0 && (
            <span className="flex items-center gap-1" title="المرفقات">
              <svg className="size-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z"
                  clipRule="evenodd"
                />
              </svg>
              {campaign.attachments.length}
            </span>
          )}
        </div>

        {/* Quick Stage Mover Selector */}
        <select
          aria-label="Move campaign stage"
          value={campaign.stage}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onMoveStage(e.target.value as CampaignStage);
          }}
          className="rounded border border-[#333] bg-[#1a1a1a] px-1 py-0.5 text-[10px] text-subtle hover:text-foreground"
        >
          {CAMPAIGN_STAGES_CONFIG.map((s) => (
            <option key={s.id} value={s.id}>
              نقل: {s.labelAr}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Manager Approval Status Badge
export function ManagerApprovalBadge({
  status,
}: {
  status: Campaign["managerApproval"]["status"];
}) {
  switch (status) {
    case "approved":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          معتمد
        </span>
      );
    case "conditional":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
          <span className="size-1.5 rounded-full bg-amber-400" />
          معتمد بملاحظات
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400">
          <span className="size-1.5 rounded-full bg-rose-400" />
          مطلوب تعديلات
        </span>
      );
    case "pending":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-400">
          <span className="size-1.5 rounded-full bg-orange-400 animate-pulse" />
          بانتظار المدير
        </span>
      );
  }
}

"use client";

import { useMemo, useState } from "react";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { ScrollArea } from "@/components/_ui/scroll-area";
import {
  CAMPAIGN_TYPES_CONFIG,
  type Campaign,
  type CampaignType,
} from "@/data/campaigns";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import { ManagerApprovalBadge } from "../campaigns-board";

export default function MediaCalendar() {
  const campaigns = useCompaniesStore((state) => state.campaigns);
  const openCampaignDetail = useCompaniesStore(
    (state) => state.openCampaignDetail,
  );
  const { t, formatMoneyLocale } = useTranslation();

  const [filterType, setFilterType] = useState<string>("all");

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((camp) => {
      if (filterType !== "all" && camp.type !== filterType) return false;
      return true;
    });
  }, [campaigns, filterType]);

  // Upcoming scheduled milestones
  const milestones = useMemo(() => {
    const list: {
      id: string;
      campaignId: string;
      campaignTitle: string;
      entityName: string;
      type: CampaignType;
      date: string;
      title: string;
      lead: string;
      budget: number;
      status: Campaign["managerApproval"]["status"];
    }[] = [];

    filteredCampaigns.forEach((c) => {
      if (c.eventDate) {
        list.push({
          id: `${c.id}-event`,
          campaignId: c.id,
          campaignTitle: c.title,
          entityName: c.entityName,
          type: c.type,
          date: c.eventDate,
          title: `موعد الفعالية والتغطية الحية: ${c.title}`,
          lead: c.creativeLead,
          budget: c.totalBudget,
          status: c.managerApproval.status,
        });
      }
      if (c.dueDate) {
        list.push({
          id: `${c.id}-due`,
          campaignId: c.id,
          campaignTitle: c.title,
          entityName: c.entityName,
          type: c.type,
          date: c.dueDate,
          title: `الموعد النهائي لتسليم المخرجات والاعتماد: ${c.title}`,
          lead: c.creativeLead,
          budget: c.totalBudget,
          status: c.managerApproval.status,
        });
      }
    });

    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredCampaigns]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Calendar Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold text-foreground">
            {t.campaigns.calendarTitle}
          </h2>
          <p className="caption-style text-subtle">
            {t.campaigns.calendarSubtitle}
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant={filterType === "all" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilterType("all")}
            className="text-xs rounded-full"
          >
            {t.campaigns.allTypes}
          </Button>
          <Button
            variant={filterType === "coverage" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilterType("coverage")}
            className="text-xs rounded-full"
          >
            {t.campaigns.typeCoverage}
          </Button>
          <Button
            variant={filterType === "advertising" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilterType("advertising")}
            className="text-xs rounded-full"
          >
            {t.campaigns.typeAdvertising}
          </Button>
          <Button
            variant={filterType === "design" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilterType("design")}
            className="text-xs rounded-full"
          >
            {t.campaigns.typeDesign}
          </Button>
        </div>
      </div>

      {/* Timeline Stream */}
      <ScrollArea className="flex-1 p-5">
        <div className="mx-auto max-w-4xl flex flex-col gap-4">
          {milestones.length === 0 ? (
            <div className="py-12 text-center text-sm text-subtle">
              لا توجد فعاليات مجدولة مطابقة للتصفية الحالية.
            </div>
          ) : (
            milestones.map((item) => {
              const typeConfig = CAMPAIGN_TYPES_CONFIG[item.type];
              return (
                <div
                  key={item.id}
                  onClick={() => openCampaignDetail(item.campaignId)}
                  className="group relative flex cursor-pointer flex-col gap-3 rounded-xl border border-line-strong bg-[#1c1c1c] p-4 shadow-sm transition-all hover:border-primary/60 hover:bg-[#222]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 rounded-lg border border-[#333] bg-[#282828] px-2.5 py-1 text-xs font-semibold text-emerald-400">
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
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        {item.date}
                      </span>
                      <Tag tone={typeConfig.badgeTone} size="sm">
                        {typeConfig.badgeAr}
                      </Tag>
                    </div>

                    <ManagerApprovalBadge status={item.status} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary-foreground">
                      {item.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-subtle">
                      <span>الجهة: {item.entityName}</span>
                      <span>المسؤول: {item.lead}</span>
                      <span className="font-semibold text-emerald-400">
                        الميزانية: {formatMoneyLocale(item.budget)}{" "}
                        {t.campaigns.currency}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

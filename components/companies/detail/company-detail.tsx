"use client";

import { useState } from "react";
import Asset from "@/components/_ui/asset";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import { ScrollArea } from "@/components/_ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import FilterMenu from "@/components/_common/filter-menu";
import DetailSection from "./detail-section";
import PipelineHealth from "./pipeline-health";
import ActivityTrend from "./activity-trend";
import ScoreCard from "./score-card";
import {
  SCORE_CARDS,
  TAG_TONES,
  TREND_WINDOWS,
  ownerByName,
} from "@/data/companies";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import BuildingIcon from "@/public/assets/images/companies/detail/building.svg";
import XIcon from "@/public/assets/images/companies/detail/x.svg";
import MailIcon from "@/public/assets/images/companies/detail/mail-04.svg";
import PhoneIcon from "@/public/assets/images/companies/detail/phone.svg";

export default function CompanyDetail() {
  const detailId = useCompaniesStore((state) => state.detailId);
  const detailOpen = useCompaniesStore((state) => state.detailOpen);
  const companies = useCompaniesStore((state) => state.companies);
  const campaigns = useCompaniesStore((state) => state.campaigns);
  const openCampaignDetail = useCompaniesStore(
    (state) => state.openCampaignDetail,
  );
  const closeDetail = useCompaniesStore((state) => state.closeDetail);
  const openProfile = useCompaniesStore((state) => state.openProfile);
  const [trendWindow, setTrendWindow] = useState(TREND_WINDOWS[1]);
  const [scoreWindow, setScoreWindow] = useState(TREND_WINDOWS[1]);
  const { t, isRtl, translateTag, translateTrendWindow, formatMoneyLocale } =
    useTranslation();

  const windowOptions = TREND_WINDOWS.map((label) => ({
    value: label,
    label: translateTrendWindow(label),
  }));

  const company = companies.find((item) => item.id === detailId);
  const owner = company ? ownerByName(company.owner) : null;

  return (
    <Sheet
      open={detailOpen && company !== undefined}
      onOpenChange={(open) => !open && closeDetail()}
    >
      <SheetContent
        side={isRtl ? "left" : "right"}
        className="sm:w-[560px] sm:max-w-[560px]"
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <BuildingIcon aria-hidden className="text-icon size-3.5" />
            <SheetTitle>{t.companyDetail.title}</SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            {t.companyDetail.description}
          </SheetDescription>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-me-1"
              aria-label={t.common.close}
            >
              <XIcon aria-hidden className="text-foreground size-4" />
            </Button>
          </SheetClose>
        </SheetHeader>

        {company && owner && (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex items-start gap-3 p-5 shadow-[inset_0_-1px_0_var(--line-strong)]">
              <span className="bg-muted flex size-[50px] shrink-0 items-center justify-center rounded-[12.5px] shadow-[0px_6.25px_6.25px_0px_rgba(15,15,15,0.24),0px_0px_0px_1.563px_#232323]">
                {company.logo ? (
                  <Asset
                    type="image"
                    src={company.logo}
                    alt={`${company.name} logo`}
                    width={1}
                    height={1}
                    fit="contain"
                    className="size-8"
                  />
                ) : (
                  <span className="h2-style text-soft">
                    {company.name.slice(0, 1)}
                  </span>
                )}
              </span>
              <div className="flex min-w-0 flex-col gap-3">
                <h2 className="truncate">{company.name}</h2>
                <div className="flex flex-wrap items-center gap-[3px]">
                  {company.tags.map((tag) => (
                    <Tag key={tag} tone={TAG_TONES[tag]} size="sm">
                      {translateTag(tag)}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>

            <DetailSection title={t.companyDetail.accountSummary}>
              <div className="lead-style flex flex-wrap items-center gap-x-4 gap-y-3">
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => openProfile(owner.name)}
                  aria-label={`Open ${owner.name} profile`}
                  className="lead-style text-foreground -mx-1.5 gap-1.5 px-1.5 py-1 font-medium"
                >
                  <Avatar src={owner.avatar} alt="" />
                  {owner.name}
                </Button>
                <span className="flex items-center gap-1">
                  <MailIcon aria-hidden className="text-soft size-3" />
                  {owner.email}
                </span>
                <span className="flex items-center gap-1">
                  <PhoneIcon aria-hidden className="text-soft size-3" />
                  {owner.phone}
                </span>
              </div>
            </DetailSection>

            <DetailSection title={t.companyDetail.pipelineHealth}>
              <PipelineHealth company={company} />
            </DetailSection>

            {(() => {
              const entityCampaigns = campaigns.filter(
                (c) =>
                  c.entityId === company.id ||
                  company.name.includes(c.entityName) ||
                  c.entityName.includes(company.name.slice(0, 10)),
              );
              if (entityCampaigns.length === 0) return null;
              return (
                <DetailSection title="الحملات والمشاريع الإبداعية المعتمدة">
                  <div className="flex flex-col gap-2">
                    {entityCampaigns.map((camp) => (
                      <div
                        key={camp.id}
                        onClick={() => openCampaignDetail(camp.id)}
                        className="flex cursor-pointer flex-col gap-1.5 rounded-lg border border-[#2e2e2e] bg-[#202020] p-3 hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">
                            {camp.title}
                          </span>
                          <span className="text-xs font-bold text-emerald-400">
                            {formatMoneyLocale(camp.totalBudget)} ر.س
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-subtle">
                          <span>المسؤول: {camp.creativeLead}</span>
                          <span>{camp.progress}% إنجاز</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              );
            })()}

            <DetailSection
              title={t.companyDetail.activityTrend}
              action={
                <FilterMenu
                  value={trendWindow}
                  options={windowOptions}
                  onChange={setTrendWindow}
                  align="end"
                />
              }
            >
              <ActivityTrend company={company} />
            </DetailSection>

            <DetailSection
              title={t.companyDetail.scoreCard}
              className="gap-3 shadow-none"
              action={
                <FilterMenu
                  value={scoreWindow}
                  options={windowOptions}
                  onChange={setScoreWindow}
                  align="end"
                  className="shadow-[0px_4px_4px_0px_rgba(15,15,15,0.24),0px_0px_0px_1px_#393939]"
                />
              }
            >
              <div className="flex flex-col gap-2">
                {SCORE_CARDS.map((card, index) => (
                  <ScoreCard key={`${card.title}-${index}`} card={card} />
                ))}
              </div>
            </DetailSection>
          </ScrollArea>
        )}

        <SheetFooter>
          <Button variant="link" size="none" href="#" className="lead-style">
            {t.companyDetail.needHelp}
          </Button>
          <div className="flex items-center gap-2">
            <SheetClose asChild>
              <Button variant="subtle" size="sm">
                {t.common.cancel}
              </Button>
            </SheetClose>
            <Button variant="primary" size="sm" onClick={closeDetail}>
              {t.common.saveUpdate}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

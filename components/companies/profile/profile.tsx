"use client";

import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
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
import DetailSection from "../detail/detail-section";
import ProfileAccount from "./profile-account";
import { CURRENT_USER, profileByName } from "@/data/companies";
import { ALL_OWNERS, formatMoney } from "@/lib/companies";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import UsersIcon from "@/public/assets/images/companies/sidebar/users.svg";
import XIcon from "@/public/assets/images/companies/detail/x.svg";
import MailIcon from "@/public/assets/images/companies/detail/mail-04.svg";
import PhoneIcon from "@/public/assets/images/companies/detail/phone.svg";
import GlobeIcon from "@/public/assets/images/_common/globe.svg";
import WhatsAppIcon from "@/public/assets/images/_common/whatsapp.svg";

export default function Profile() {
  const profileName = useCompaniesStore((state) => state.profileName);
  const profileOpen = useCompaniesStore((state) => state.profileOpen);
  const companies = useCompaniesStore((state) => state.companies);
  const closeProfile = useCompaniesStore((state) => state.closeProfile);
  const openDetail = useCompaniesStore((state) => state.openDetail);
  const setOwner = useCompaniesStore((state) => state.setOwner);
  const { t, isRtl } = useTranslation();

  const person = profileName ? profileByName(profileName) : null;
  const isCurrentUser = person?.name === CURRENT_USER.name;
  const accounts = person
    ? companies
        .filter((company) => isCurrentUser || company.owner === person.name)
        .sort((a, b) => b.pipelineValue - a.pipelineValue)
    : [];

  const openDeals = accounts.reduce((sum, company) => sum + company.openDeals, 0);
  const pipeline = accounts.reduce(
    (sum, company) => sum + company.pipelineValue,
    0,
  );
  const avgWin = accounts.length
    ? Math.round(
        accounts.reduce((sum, company) => sum + company.winProbability, 0) /
          accounts.length,
      )
    : 0;

  const stats = [
    { label: t.profile.statsAccounts, value: String(accounts.length) },
    { label: t.profile.statsOpenDeals, value: String(openDeals) },
    { label: t.profile.statsPipeline, value: `$${formatMoney(pipeline)}` },
    { label: t.profile.statsAvgWin, value: `${avgWin}%` },
  ];

  function showAccounts() {
    setOwner(isCurrentUser || !person ? ALL_OWNERS : person.name);
    closeProfile();
  }

  return (
    <Sheet
      open={profileOpen && person !== null}
      onOpenChange={(open) => !open && closeProfile()}
    >
      <SheetContent
        side={isRtl ? "left" : "right"}
        className="sm:w-[480px] sm:max-w-[480px]"
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <UsersIcon aria-hidden className="text-icon size-3.5" />
            <SheetTitle>
              {isCurrentUser ? t.profile.myProfile : t.profile.ownerProfile}
            </SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            {t.profile.description}
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

        {person && (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex items-center gap-3 p-5 shadow-[inset_0_-1px_0_var(--line-strong)]">
              <Avatar
                src={person.avatar}
                alt=""
                className="size-[50px] shadow-[0px_6.25px_6.25px_0px_rgba(15,15,15,0.24),0px_0px_0px_1.563px_#232323]"
              />
              <div className="flex min-w-0 flex-col gap-2">
                <h2 className="truncate">{person.name}</h2>
                <span className="caption-style text-soft block truncate">
                  {person.role}
                </span>
              </div>
            </div>

            <DetailSection title={t.profile.contact}>
              <div className="lead-style flex flex-wrap items-center gap-x-4 gap-y-3">
                {person.website && (
                  <a
                    href={`https://${person.website.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-soft ease-power3-in-out flex items-center gap-1.5 font-medium text-blue-400 transition-colors duration-150 hover:underline"
                  >
                    <GlobeIcon aria-hidden className="size-3.5 text-blue-400" />
                    {person.website}
                  </a>
                )}
                {person.whatsapp && (
                  <a
                    href={`https://wa.me/966${person.whatsapp.replace(/^0+/, "").replace(/[^\d]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-soft ease-power3-in-out flex items-center gap-1.5 font-medium text-emerald-400 transition-colors duration-150 hover:underline"
                  >
                    <WhatsAppIcon aria-hidden className="size-3.5 text-emerald-400" />
                    <span>{person.whatsapp}</span>
                    <span className="caption-style bg-emerald-500/10 text-emerald-400 rounded px-1.5 py-0.2 text-[10px]">
                      WhatsApp
                    </span>
                  </a>
                )}
                <a
                  href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
                  className="hover:text-soft ease-power3-in-out flex items-center gap-1 transition-colors duration-150"
                >
                  <PhoneIcon aria-hidden className="text-soft size-3" />
                  {person.phone}
                </a>
                <a
                  href={`mailto:${person.email}`}
                  className="hover:text-soft ease-power3-in-out flex items-center gap-1 transition-colors duration-150"
                >
                  <MailIcon aria-hidden className="text-soft size-3" />
                  {person.email}
                </a>
              </div>
            </DetailSection>

            <DetailSection title={isCurrentUser ? t.profile.teamPipeline : t.profile.pipeline}>
              <div className="grid grid-cols-2 gap-2">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="border-line-strong flex flex-col gap-3 rounded-lg border p-[11px]"
                  >
                    <span className="caption-style text-soft block">
                      {stat.label}
                    </span>
                    <span className="lead-style block tabular-nums">
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            </DetailSection>

            <DetailSection
              title={isCurrentUser ? t.profile.teamAccounts : t.profile.accounts}
              className="shadow-none"
            >
              {accounts.length > 0 ? (
                <ul className="-mx-2 flex flex-col gap-0.5">
                  {accounts.map((company) => (
                    <ProfileAccount
                      key={company.id}
                      company={company}
                      onOpen={() => openDetail(company.id)}
                    />
                  ))}
                </ul>
              ) : (
                <span className="caption-style text-subtle block">
                  {t.profile.noAccounts}
                </span>
              )}
            </DetailSection>
          </ScrollArea>
        )}

        <SheetFooter>
          <SheetClose asChild>
            <Button variant="subtle" size="sm">
              {t.common.close}
            </Button>
          </SheetClose>
          <Button
            variant="primary"
            size="sm"
            onClick={showAccounts}
            disabled={accounts.length === 0}
          >
            {isCurrentUser ? t.profile.showAllAccounts : t.profile.filterTableByOwner}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

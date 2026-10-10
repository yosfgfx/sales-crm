"use client";

import { ScrollArea } from "@/components/_ui/scroll-area";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarSection from "./sidebar-section";
import Avatar from "@/components/_ui/avatar";
import { CURRENT_USER } from "@/data/companies";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import Logo from "@/public/assets/images/_common/logo.svg";
import BuildingIcon from "@/public/assets/images/companies/sidebar/building.svg";
import ClipboardIcon from "@/public/assets/images/companies/sidebar/clipboard.svg";
import BarChartIcon from "@/public/assets/images/companies/sidebar/bar-chart.svg";
import ListIcon from "@/public/assets/images/companies/sidebar/list.svg";
import BookClosedIcon from "@/public/assets/images/companies/sidebar/book-closed.svg";
import MailIcon from "@/public/assets/images/companies/sidebar/mail.svg";
import TargetIcon from "@/public/assets/images/companies/sidebar/target-05.svg";
import TargetAltIcon from "@/public/assets/images/companies/sidebar/target-03.svg";
import UsersIcon from "@/public/assets/images/companies/sidebar/users.svg";
import BarChartAltIcon from "@/public/assets/images/companies/sidebar/bar-chart-10.svg";
import AlertTriangleIcon from "@/public/assets/images/companies/sidebar/alert-triangle.svg";
import DotYellow from "@/public/assets/images/companies/sidebar/dot-yellow.svg";
import DotPink from "@/public/assets/images/companies/sidebar/dot-pink.svg";
import DotPurple from "@/public/assets/images/companies/sidebar/dot-purple.svg";
import UserPlusIcon from "@/public/assets/images/companies/sidebar/user-plus.svg";
import MessageQuestionIcon from "@/public/assets/images/companies/sidebar/message-question.svg";

export default function SidebarContent() {
  const companyCount = useCompaniesStore((state) => state.companies.length);
  const campaigns = useCompaniesStore((state) => state.campaigns);
  const activeTab = useCompaniesStore((state) => state.activeTab);
  const setActiveTab = useCompaniesStore((state) => state.setActiveTab);
  const openProfile = useCompaniesStore((state) => state.openProfile);
  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);
  const { t } = useTranslation();

  const handleTabSwitch = (tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const pendingApprovalsCount = campaigns.filter(
    (c) => c.managerApproval.status === "pending",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand Header */}
      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center gap-2 border-b p-3">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">
            {t.common.appName}
          </span>
          <span className="caption-style text-subtle block truncate">
            {t.common.appSubtitle}
          </span>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary">
          {/* Main Workspaces */}
          <SidebarSection className="border-sidebar-border border-b">
            <SidebarNavItem
              icon={ClipboardIcon}
              label={t.sidebar.dealsBoard}
              count={campaigns.length}
              active={activeTab === "deals"}
              onClick={() => handleTabSwitch("deals")}
            />
            <SidebarNavItem
              icon={AlertTriangleIcon}
              label="اعتمادات المدير والمالية"
              count={pendingApprovalsCount}
              active={activeTab === "approvals"}
              onClick={() => handleTabSwitch("approvals")}
            />
            <SidebarNavItem
              icon={BuildingIcon}
              label={t.sidebar.companies}
              count={companyCount}
              active={activeTab === "companies"}
              onClick={() => handleTabSwitch("companies")}
            />
            <SidebarNavItem
              icon={BarChartIcon}
              label={t.sidebar.forecast}
              count={8}
              active={activeTab === "forecast"}
              onClick={() => handleTabSwitch("forecast")}
            />
            <SidebarNavItem
              icon={ListIcon}
              label={t.sidebar.activities}
              onClick={() => handleTabSwitch("deals")}
            />
            <SidebarNavItem
              icon={BookClosedIcon}
              label={t.sidebar.contacts}
              count={18}
              onClick={() => handleTabSwitch("companies")}
            />
            <SidebarNavItem
              icon={MailIcon}
              label={t.sidebar.emailSequences}
              onClick={() => handleTabSwitch("deals")}
            />
          </SidebarSection>

          {/* Media Production Teams */}
          <SidebarSection
            title={t.sidebar.team}
            className="border-sidebar-border border-b"
          >
            <SidebarNavItem
              icon={TargetIcon}
              label={t.sidebar.strategicAes}
              onClick={() => handleTabSwitch("deals")}
            />
            <SidebarNavItem
              icon={TargetAltIcon}
              label={t.sidebar.midMarket}
              onClick={() => handleTabSwitch("deals")}
            />
            <SidebarNavItem
              icon={UsersIcon}
              label={t.sidebar.sdrTeam}
              onClick={() => handleTabSwitch("deals")}
            />
          </SidebarSection>

          {/* Reporting & Directives */}
          <SidebarSection
            title={t.sidebar.reporting}
            className="border-sidebar-border border-b"
          >
            <SidebarNavItem
              icon={BarChartAltIcon}
              label={t.sidebar.q1Forecast}
              onClick={() => handleTabSwitch("deals")}
            />
            <SidebarNavItem
              icon={AlertTriangleIcon}
              label={t.sidebar.slippingDeals}
              count={pendingApprovalsCount}
              active={activeTab === "approvals"}
              onClick={() => handleTabSwitch("approvals")}
            />
          </SidebarSection>

          {/* Beneficial Sectors */}
          <SidebarSection title={t.sidebar.pipelines}>
            <SidebarNavItem
              icon={DotYellow}
              label={t.sidebar.northAmerica}
              onClick={() => handleTabSwitch("companies")}
            />
            <SidebarNavItem
              icon={DotPink}
              label={t.sidebar.emeaEnterprise}
              onClick={() => handleTabSwitch("companies")}
            />
            <SidebarNavItem
              icon={DotPurple}
              label={t.sidebar.apacExpansion}
              onClick={() => handleTabSwitch("companies")}
            />
          </SidebarSection>
        </nav>
      </ScrollArea>

      {/* Support & Invites */}
      <SidebarSection className="border-sidebar-border shrink-0 border-t border-b">
        <SidebarNavItem
          icon={UserPlusIcon}
          label={t.common.inviteTeammates}
          tone="quiet"
        />
        <SidebarNavItem
          icon={MessageQuestionIcon}
          label={t.common.help}
          tone="quiet"
        />
      </SidebarSection>

      {/* User Footer Profile */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => openProfile(CURRENT_USER.name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openProfile(CURRENT_USER.name);
          }
        }}
        aria-label={`الملف التعريفي لمطور ومصمم النظام: ${CURRENT_USER.name}`}
        className="border-sidebar-border bg-sidebar-accent hover:bg-white/5 flex shrink-0 cursor-pointer items-center justify-between gap-2.5 border-t border-b p-3 transition-colors duration-150"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            src={CURRENT_USER.avatar}
            alt={CURRENT_USER.name}
            className="size-8.5 ring-1 ring-white/10 shrink-0"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="lead-style block truncate font-medium text-foreground text-[13px]">
              {CURRENT_USER.name}
            </span>
            <span className="caption-style text-subtle block truncate text-[11px]">
              {CURRENT_USER.website} • {CURRENT_USER.phone}
            </span>
          </div>
        </div>
        <span className="caption-style bg-primary/10 text-primary border-primary/20 rounded-full border px-2 py-0.5 shrink-0 text-[10px] font-medium">
          مطور النظام
        </span>
      </div>
    </div>
  );
}

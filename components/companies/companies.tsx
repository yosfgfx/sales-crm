"use client";

import CompaniesHeader from "./header/header";
import CompaniesToolbar from "./toolbar/toolbar";
import CompaniesTable from "./table/companies-table";
import CompanyDetail from "./detail/company-detail";
import Profile from "./profile/profile";
import NewCompanyDialog from "./new-company/new-company-dialog";
import CommandMenu from "./command-menu/command-menu";
import CampaignsBoard from "@/components/campaigns/campaigns-board";
import ManagerApprovals from "@/components/campaigns/manager-approvals";
import MediaCalendar from "@/components/campaigns/calendar/media-calendar";
import CampaignDetailSheet from "@/components/campaigns/detail/campaign-detail-sheet";
import NewCampaignDialog from "@/components/campaigns/new-campaign-dialog";
import { useCompaniesStore } from "@/stores/companies-store";

export default function Companies() {
  const activeTab = useCompaniesStore((state) => state.activeTab);

  return (
    <section id="companies" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CompaniesHeader />

      {activeTab === "deals" && <CampaignsBoard />}
      {activeTab === "approvals" && <ManagerApprovals />}
      {activeTab === "forecast" && <MediaCalendar />}
      {activeTab === "companies" && (
        <>
          <CompaniesToolbar />
          <CompaniesTable />
        </>
      )}

      {/* Detail sheets and Modals */}
      <CompanyDetail />
      <CampaignDetailSheet />
      <NewCampaignDialog />
      <Profile />
      <NewCompanyDialog />
      <CommandMenu />
    </section>
  );
}

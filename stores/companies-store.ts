import { create } from "zustand";
import { COMPANIES, type Company, type SortKey } from "@/data/companies";
import { NOTIFICATIONS } from "@/data/notifications";
import {
  INITIAL_CAMPAIGNS,
  type Campaign,
  type CampaignStage,
  type CampaignQuotation,
  type BudgetItem,
  type CampaignAttachment,
  type ManagerApproval,
} from "@/data/campaigns";
import { DEFAULT_FILTERS } from "@/lib/companies";

type CompaniesState = {
  // Existing entities & companies state
  companies: Company[];
  sortBy: SortKey;
  owner: string;
  stage: string;
  activityWindow: number;
  selectedIds: string[];
  detailId: string | null;
  detailOpen: boolean;
  profileName: string | null;
  profileOpen: boolean;
  newCompanyOpen: boolean;
  sidebarOpen: boolean;
  searchOpen: boolean;
  unreadNotificationIds: string[];
  activeTab: string;

  // Campaigns & Creative Projects state
  campaigns: Campaign[];
  selectedCampaignId: string | null;
  campaignDetailOpen: boolean;
  campaignFilterType: string;
  campaignViewMode: "board" | "list";
  newCampaignOpen: boolean;

  // Existing methods
  setSortBy: (sortBy: SortKey) => void;
  setOwner: (owner: string) => void;
  setStage: (stage: string) => void;
  setActivityWindow: (days: number) => void;
  resetFilters: () => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openProfile: (name: string) => void;
  closeProfile: () => void;
  setNewCompanyOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setActiveTab: (tab: string) => void;
  addCompany: (company: Company) => void;

  // Creative Campaigns methods
  openCampaignDetail: (id: string) => void;
  closeCampaignDetail: () => void;
  setCampaignFilterType: (type: string) => void;
  setCampaignViewMode: (mode: "board" | "list") => void;
  setNewCampaignOpen: (open: boolean) => void;
  updateCampaignStage: (campaignId: string, stage: CampaignStage) => void;
  updateManagerApproval: (
    campaignId: string,
    approval: Partial<ManagerApproval>,
  ) => void;
  addCampaignQuotation: (
    campaignId: string,
    quote: CampaignQuotation,
  ) => void;
  setQuotationStatus: (
    campaignId: string,
    quoteId: string,
    status: "approved" | "pending" | "rejected",
  ) => void;
  addBudgetItem: (campaignId: string, item: BudgetItem) => void;
  updateBudgetItem: (
    campaignId: string,
    itemId: string,
    updates: Partial<BudgetItem>,
  ) => void;
  addAttachment: (
    campaignId: string,
    attachment: CampaignAttachment,
  ) => void;
  addCampaign: (campaign: Campaign) => void;
};

export const useCompaniesStore = create<CompaniesState>((set) => ({
  companies: COMPANIES,
  ...DEFAULT_FILTERS,
  selectedIds: ["tech-solutions"],
  detailId: null,
  detailOpen: false,
  profileName: null,
  profileOpen: false,
  newCompanyOpen: false,
  sidebarOpen: false,
  searchOpen: false,
  unreadNotificationIds: NOTIFICATIONS.filter((item) => item.unread).map(
    (item) => item.id,
  ),
  activeTab: "deals",

  // Creative Campaigns initial state
  campaigns: INITIAL_CAMPAIGNS,
  selectedCampaignId: INITIAL_CAMPAIGNS[0].id,
  campaignDetailOpen: false,
  campaignFilterType: "all",
  campaignViewMode: "board",
  newCampaignOpen: false,

  setSortBy: (sortBy) => set({ sortBy }),
  setOwner: (owner) => set({ owner }),
  setStage: (stage) => set({ stage }),
  setActivityWindow: (activityWindow) => set({ activityWindow }),
  resetFilters: () => set({ ...DEFAULT_FILTERS }),
  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selected) => selected !== id)
        : [...state.selectedIds, id],
    })),
  setSelected: (selectedIds) => set({ selectedIds }),
  openDetail: (detailId) =>
    set({ detailId, detailOpen: true, profileOpen: false, campaignDetailOpen: false }),
  closeDetail: () => set({ detailOpen: false }),
  openProfile: (profileName) =>
    set({ profileName, profileOpen: true, detailOpen: false, campaignDetailOpen: false }),
  closeProfile: () => set({ profileOpen: false }),
  setNewCompanyOpen: (newCompanyOpen) => set({ newCompanyOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  markNotificationRead: (id) =>
    set((state) => ({
      unreadNotificationIds: state.unreadNotificationIds.filter(
        (unread) => unread !== id,
      ),
    })),
  markAllNotificationsRead: () => set({ unreadNotificationIds: [] }),
  setActiveTab: (activeTab) => set({ activeTab }),
  addCompany: (company) =>
    set((state) => ({
      companies: [company, ...state.companies],
      newCompanyOpen: false,
    })),

  // Campaigns action implementations
  openCampaignDetail: (selectedCampaignId) =>
    set({ selectedCampaignId, campaignDetailOpen: true, detailOpen: false, profileOpen: false }),
  closeCampaignDetail: () => set({ campaignDetailOpen: false }),
  setCampaignFilterType: (campaignFilterType) => set({ campaignFilterType }),
  setCampaignViewMode: (campaignViewMode) => set({ campaignViewMode }),
  setNewCampaignOpen: (newCampaignOpen) => set({ newCampaignOpen }),

  updateCampaignStage: (campaignId, stage) =>
    set((state) => ({
      campaigns: state.campaigns.map((camp) =>
        camp.id === campaignId ? { ...camp, stage } : camp,
      ),
    })),

  updateManagerApproval: (campaignId, approvalUpdates) =>
    set((state) => ({
      campaigns: state.campaigns.map((camp) => {
        if (camp.id !== campaignId) return camp;
        return {
          ...camp,
          managerApproval: {
            ...camp.managerApproval,
            ...approvalUpdates,
          },
        };
      }),
    })),

  addCampaignQuotation: (campaignId, quote) =>
    set((state) => ({
      campaigns: state.campaigns.map((camp) => {
        if (camp.id !== campaignId) return camp;
        return {
          ...camp,
          quotations: [quote, ...camp.quotations],
        };
      }),
    })),

  setQuotationStatus: (campaignId, quoteId, status) =>
    set((state) => ({
      campaigns: state.campaigns.map((camp) => {
        if (camp.id !== campaignId) return camp;
        return {
          ...camp,
          quotations: camp.quotations.map((q) =>
            q.id === quoteId
              ? { ...q, status }
              : status === "approved"
                ? { ...q, status: q.status === "approved" ? "pending" : q.status }
                : q,
          ),
        };
      }),
    })),

  addBudgetItem: (campaignId, item) =>
    set((state) => ({
      campaigns: state.campaigns.map((camp) => {
        if (camp.id !== campaignId) return camp;
        const budgetItems = [...camp.budgetItems, item];
        const totalBudget = budgetItems.reduce((acc, b) => acc + b.allocated, 0);
        const spentBudget = budgetItems.reduce((acc, b) => acc + b.spent, 0);
        return {
          ...camp,
          budgetItems,
          totalBudget,
          spentBudget,
        };
      }),
    })),

  updateBudgetItem: (campaignId, itemId, updates) =>
    set((state) => ({
      campaigns: state.campaigns.map((camp) => {
        if (camp.id !== campaignId) return camp;
        const budgetItems = camp.budgetItems.map((b) =>
          b.id === itemId ? { ...b, ...updates } : b,
        );
        const totalBudget = budgetItems.reduce((acc, b) => acc + b.allocated, 0);
        const spentBudget = budgetItems.reduce((acc, b) => acc + b.spent, 0);
        return {
          ...camp,
          budgetItems,
          totalBudget,
          spentBudget,
        };
      }),
    })),

  addAttachment: (campaignId, attachment) =>
    set((state) => ({
      campaigns: state.campaigns.map((camp) => {
        if (camp.id !== campaignId) return camp;
        return {
          ...camp,
          attachments: [attachment, ...camp.attachments],
        };
      }),
    })),

  addCampaign: (campaign) =>
    set((state) => ({
      campaigns: [campaign, ...state.campaigns],
      newCampaignOpen: false,
      selectedCampaignId: campaign.id,
      campaignDetailOpen: true,
    })),
}));

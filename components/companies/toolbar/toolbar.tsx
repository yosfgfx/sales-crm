"use client";

import Button from "@/components/_ui/button";
import FilterMenu from "@/components/_common/filter-menu";
import MobileFilters from "./mobile-filters";
import {
  ACTIVITY_OPTIONS,
  OWNER_OPTIONS,
  SORT_MENU_OPTIONS,
  STAGE_OPTIONS,
} from "./filter-options";
import type { SortKey } from "@/data/companies";
import { TODAY, companiesCsvRows, filterCompanies } from "@/lib/companies";
import { downloadCsv } from "@/lib/csv";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import ShareIcon from "@/public/assets/images/companies/toolbar/share.svg";
import PlusIcon from "@/public/assets/images/_common/plus.svg";

export default function CompaniesToolbar() {
  const sortBy = useCompaniesStore((state) => state.sortBy);
  const owner = useCompaniesStore((state) => state.owner);
  const stage = useCompaniesStore((state) => state.stage);
  const activityWindow = useCompaniesStore((state) => state.activityWindow);
  const setSortBy = useCompaniesStore((state) => state.setSortBy);
  const setOwner = useCompaniesStore((state) => state.setOwner);
  const setStage = useCompaniesStore((state) => state.setStage);
  const setActivityWindow = useCompaniesStore(
    (state) => state.setActivityWindow,
  );
  const setNewCompanyOpen = useCompaniesStore(
    (state) => state.setNewCompanyOpen,
  );
  const { t, translateSort, translateTag } = useTranslation();

  const sortOptions = SORT_MENU_OPTIONS.map((opt) => ({
    value: opt.value,
    label: translateSort(opt.value as SortKey),
  }));

  const ownerOptions = OWNER_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.value === "all" ? t.toolbar.allOwners : opt.label,
  }));

  const stageOptions = STAGE_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.value === "any" ? t.toolbar.anyStage : translateTag(opt.value),
  }));

  const activityOptions = ACTIVITY_OPTIONS.map((opt) => ({
    value: opt.value,
    label: t.toolbar.daysAgo.replace("{days}", opt.value),
  }));

  function exportCsv() {
    const { companies } = useCompaniesStore.getState();
    const visible = filterCompanies(companies, {
      sortBy,
      owner,
      stage,
      activityWindow,
    });
    downloadCsv(`companies-${TODAY}.csv`, companiesCsvRows(visible));
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-4">
      <MobileFilters className="sm:hidden" />

      <div className="hidden min-w-0 flex-wrap gap-2 sm:flex">
        <FilterMenu
          label={t.toolbar.sortBy}
          value={sortBy}
          options={sortOptions}
          onChange={(value) => setSortBy(value as SortKey)}
        />
        <FilterMenu
          label={t.toolbar.filter}
          value={owner}
          options={ownerOptions}
          onChange={setOwner}
        />
        <FilterMenu
          label={t.toolbar.stage}
          value={stage}
          options={stageOptions}
          onChange={setStage}
        />
        <FilterMenu
          label={t.toolbar.lastActivity}
          value={String(activityWindow)}
          options={activityOptions}
          onChange={(value) => setActivityWindow(Number(value))}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <ShareIcon aria-hidden className="size-3" />
          {t.common.export}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setNewCompanyOpen(true)}
        >
          <PlusIcon aria-hidden className="size-3" />
          {t.common.newCompany}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Kbd,
} from "@/components/_ui/command";
import { CommandCompanyRow, CommandTableHeader } from "./command-table";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";
import PlusIcon from "@/public/assets/images/_common/plus.svg";

export default function CommandMenu() {
  const open = useCompaniesStore((state) => state.searchOpen);
  const setOpen = useCompaniesStore((state) => state.setSearchOpen);
  const companies = useCompaniesStore((state) => state.companies);
  const openDetail = useCompaniesStore((state) => state.openDetail);
  const setNewCompanyOpen = useCompaniesStore(
    (state) => state.setNewCompanyOpen,
  );
  const setNewCampaignOpen = useCompaniesStore(
    (state) => state.setNewCampaignOpen,
  );
  const [query, setQuery] = useState("");
  const actionRan = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      const { searchOpen, setSearchOpen } = useCompaniesStore.getState();
      setSearchOpen(!searchOpen);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function run(action: () => void) {
    actionRan.current = true;
    setOpen(false);
    action();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t.commandMenu.title}
      description={t.commandMenu.description}
      className="max-w-[960px]"
      onCloseAutoFocus={(event) => {
        if (actionRan.current) event.preventDefault();
        actionRan.current = false;
        setQuery("");
      }}
    >
      <Command>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t.commandMenu.placeholder}
          trailing={<Kbd>Esc</Kbd>}
        />
        <CommandTableHeader />
        <CommandList>
          <CommandEmpty>
            {t.commandMenu.noResults.replace("{query}", query)}
          </CommandEmpty>
          <CommandGroup>
            {companies.map((company) => (
              <CommandCompanyRow
                key={company.id}
                company={company}
                onSelect={() => run(() => openDetail(company.id))}
              />
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t.commandMenu.actions}>
            <CommandItem
              value="new-company"
              keywords={[
                "New Company",
                "New Department",
                "Add",
                "Create",
                "شركة جديدة",
                "إدارة جديدة",
                "شركة أو إدارة",
                "طلب جديد",
                "إضافة",
                "إنشاء",
              ]}
              onSelect={() => run(() => setNewCompanyOpen(true))}
            >
              <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-md shadow-[0px_0px_0px_1px_#232323]">
                <PlusIcon aria-hidden className="text-soft size-3" />
              </span>
              {t.commandMenu.newCompanyAction}
            </CommandItem>
            <CommandItem
              value="new-campaign"
              keywords={[
                "New Campaign",
                "New Creative",
                "Media Coverage",
                "حملة جديدة",
                "فكرة إبداعية",
                "تغطية إعلامية",
                "مشروع تصميم",
              ]}
              onSelect={() => run(() => setNewCampaignOpen(true))}
            >
              <span className="bg-primary/20 text-primary flex size-6 shrink-0 items-center justify-center rounded-md">
                <PlusIcon aria-hidden className="size-3" />
              </span>
              {t.campaigns.newCampaign}
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <CommandFooter>
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {t.common.navigate}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            {t.common.open}
          </span>
        </CommandFooter>
      </Command>
    </CommandDialog>
  );
}

"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/_ui/sheet";
import SidebarContent from "./sidebar-content";
import SidebarResizer from "./sidebar-resizer";
import { useCompaniesStore } from "@/stores/companies-store";
import { useTranslation } from "@/hooks/use-translation";

export default function Sidebar() {
  const sidebarOpen = useCompaniesStore((state) => state.sidebarOpen);
  const setSidebarOpen = useCompaniesStore((state) => state.setSidebarOpen);
  const { isRtl, t } = useTranslation();

  return (
    <>
      <aside className="relative hidden w-(--sidebar-width) shrink-0 border-r border-sidebar-border bg-sidebar rtl:border-r-0 rtl:border-l lg:flex lg:flex-col">
        <SidebarContent />
        <SidebarResizer />
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side={isRtl ? "right" : "left"}
          className="w-[254px] max-w-[85vw] border-sidebar-border bg-sidebar"
        >
          <SheetTitle className="sr-only">{t.sidebar.companies}</SheetTitle>
          <SheetDescription className="sr-only">
            {t.common.appSubtitle}
          </SheetDescription>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}

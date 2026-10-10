"use client";

import Button from "@/components/_ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

export default function LanguageSwitcher({
  className,
}: {
  className?: string;
}) {
  const { locale, toggleLocale } = useTranslation();

  return (
    <Button
      variant="secondary"
      size="none"
      onClick={toggleLocale}
      className={cn(
        "group caption-style h-[30px] gap-1.5 rounded-full px-2.5 font-normal tracking-normal transition-all duration-150 ease-power3-out",
        className,
      )}
      aria-label={
        locale === "ar" ? "Switch to English" : "التبديل إلى العربية"
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="size-3.5 text-subtle transition-colors duration-150 group-hover:text-icon"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
      <span className="flex items-center gap-1 text-[12px]">
        <span
          className={cn(
            "transition-colors duration-150",
            locale === "ar"
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          عربي
        </span>
        <span className="text-subtle/50">/</span>
        <span
          className={cn(
            "transition-colors duration-150",
            locale === "en"
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
          )}
        >
          EN
        </span>
      </span>
    </Button>
  );
}

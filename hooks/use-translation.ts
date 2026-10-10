"use client";

import { useLocaleStore } from "@/stores/locale-store";
import { TRANSLATIONS } from "@/lib/i18n/translations";
import type { Tag, SortKey } from "@/data/companies";

export function useTranslation() {
  const locale = useLocaleStore((state) => state.locale);
  const dir = useLocaleStore((state) => state.dir);
  const isRtl = useLocaleStore((state) => state.isRtl);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const toggleLocale = useLocaleStore((state) => state.toggleLocale);

  const t = TRANSLATIONS[locale];

  function translateTag(tag: string): string {
    if (tag in t.segments) {
      return t.segments[tag as keyof typeof t.segments];
    }
    if (tag in t.stages) {
      return t.stages[tag as keyof typeof t.stages];
    }
    return tag;
  }

  function translateInteraction(type: string): string {
    if (type in t.interactionTypes) {
      return t.interactionTypes[type as keyof typeof t.interactionTypes];
    }
    return type;
  }

  function translateSort(key: SortKey): string {
    if (key in t.sortOptions) {
      return t.sortOptions[key];
    }
    return key;
  }

  function translateTrendWindow(window: string): string {
    if (window in t.trendWindows) {
      return t.trendWindows[window as keyof typeof t.trendWindows];
    }
    return window;
  }

  function formatDateLocale(iso: string): string {
    const [, month, day] = iso.split("-").map(Number);
    const monthName = t.months[month - 1] ?? "";
    if (locale === "ar") {
      return `${day} ${monthName}`;
    }
    return `${monthName} ${day}`;
  }

  function formatMoneyLocale(value: number): string {
    return value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");
  }

  return {
    t,
    locale,
    dir,
    isRtl,
    setLocale,
    toggleLocale,
    translateTag,
    translateInteraction,
    translateSort,
    translateTrendWindow,
    formatDateLocale,
    formatMoneyLocale,
  };
}

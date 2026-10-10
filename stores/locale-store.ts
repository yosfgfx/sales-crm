import { create } from "zustand";
import type { Direction, Locale } from "@/lib/i18n/types";

export const LOCALE_STORAGE_KEY = "crm-locale";
export const DEFAULT_LOCALE: Locale = "ar";

type LocaleState = {
  locale: Locale;
  dir: Direction;
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  initFromStorage: () => void;
};

function syncDocument(locale: Locale) {
  if (typeof document === "undefined") return;
  const isRtl = locale === "ar";
  document.documentElement.lang = locale;
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: DEFAULT_LOCALE,
  dir: "rtl",
  isRtl: true,
  setLocale: (locale) => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {}
    syncDocument(locale);
    set({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      isRtl: locale === "ar",
    });
  },
  toggleLocale: () => {
    const next = get().locale === "ar" ? "en" : "ar";
    get().setLocale(next);
  },
  initFromStorage: () => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      if (saved && (saved === "ar" || saved === "en") && saved !== get().locale) {
        get().setLocale(saved);
      } else {
        syncDocument(get().locale);
      }
    } catch {}
  },
}));

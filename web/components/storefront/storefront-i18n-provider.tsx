"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import {
  DEFAULT_STOREFRONT_LOCALE,
  formatStorefrontMoney,
  isStorefrontLocale,
  translate,
  translatePlural,
  type MessageKey,
  type MessageVars,
  type StorefrontLocale,
} from "@/lib/storefront-i18n";

const STORAGE_KEY = "dumosrx-storefront-locale";
const LOCALE_CHANGED_EVENT = "storefront:locale-changed";

type PluralBase = Parameters<typeof translatePlural>[1];

interface StorefrontI18n {
  locale: StorefrontLocale;
  enabledLocales: StorefrontLocale[];
  setLocale: (locale: StorefrontLocale) => void;
  t: (key: MessageKey, vars?: MessageVars) => string;
  tp: (base: PluralBase, count: number, vars?: MessageVars) => string;
  money: (amount: number, currency?: string | null) => string;
}

const buildI18n = (locale: StorefrontLocale, enabledLocales: StorefrontLocale[], setLocale: (l: StorefrontLocale) => void): StorefrontI18n => ({
  locale,
  enabledLocales,
  setLocale,
  t: (key, vars) => translate(locale, key, vars),
  tp: (base, count, vars) => translatePlural(locale, base, count, vars),
  money: (amount, currency) => formatStorefrontMoney(amount, currency, locale),
});

const FALLBACK = buildI18n(DEFAULT_STOREFRONT_LOCALE, [DEFAULT_STOREFRONT_LOCALE], () => {});

const StorefrontI18nContext = createContext<StorefrontI18n>(FALLBACK);

export const useStorefrontI18n = () => useContext(StorefrontI18nContext);

const subscribe = (notify: () => void) => {
  window.addEventListener(LOCALE_CHANGED_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(LOCALE_CHANGED_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};

const readStored = (): string => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

interface StorefrontI18nProviderProps {
  defaultLocale: StorefrontLocale;
  enabledLocales: StorefrontLocale[];
  children: React.ReactNode;
}

export function StorefrontI18nProvider({ defaultLocale, enabledLocales, children }: StorefrontI18nProviderProps) {
  const stored = useSyncExternalStore(subscribe, readStored, () => "");
  const locale = isStorefrontLocale(stored) && enabledLocales.includes(stored) ? stored : defaultLocale;

  const setLocale = useCallback((next: StorefrontLocale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      return;
    }
    window.dispatchEvent(new Event(LOCALE_CHANGED_EVENT));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => buildI18n(locale, enabledLocales, setLocale), [locale, enabledLocales, setLocale]);

  return <StorefrontI18nContext.Provider value={value}>{children}</StorefrontI18nContext.Provider>;
}

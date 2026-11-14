import { EN_MESSAGES, type MessageKey } from "@/lib/storefront-messages-en";
import { FR_MESSAGES } from "@/lib/storefront-messages-fr";

export type { MessageKey };

export const STOREFRONT_LOCALES = ["en", "fr"] as const;
export type StorefrontLocale = (typeof STOREFRONT_LOCALES)[number];
export const DEFAULT_STOREFRONT_LOCALE: StorefrontLocale = "en";

export const LOCALE_NAMES: Record<StorefrontLocale, string> = { en: "English", fr: "Français" };

const MESSAGES: ReadonlyMap<StorefrontLocale, Record<MessageKey, string>> = new Map([
  ["en", EN_MESSAGES],
  ["fr", FR_MESSAGES],
]);

export type MessageVars = Record<string, string | number>;

export const isStorefrontLocale = (value: unknown): value is StorefrontLocale =>
  typeof value === "string" && (STOREFRONT_LOCALES as readonly string[]).includes(value);

export const resolveLocale = (value: unknown): StorefrontLocale =>
  isStorefrontLocale(value) ? value : DEFAULT_STOREFRONT_LOCALE;

export function resolveEnabledLocales(defaultLocale: StorefrontLocale, enabled?: readonly unknown[] | null): StorefrontLocale[] {
  const valid = (enabled ?? []).filter(isStorefrontLocale);
  return [...new Set<StorefrontLocale>([defaultLocale, ...valid])];
}

export function translate(locale: StorefrontLocale, key: MessageKey, vars?: MessageVars): string {
  const template = MESSAGES.get(locale)?.[key] ?? EN_MESSAGES[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in (vars ?? {}) ? String(vars?.[name]) : match));
}

export const pluralForm = (locale: StorefrontLocale, count: number): "one" | "other" =>
  (locale === "fr" ? count < 2 : count === 1) ? "one" : "other";

export function translatePlural(
  locale: StorefrontLocale,
  base: "products.count" | "products.viewAll" | "shop.count",
  count: number,
  vars?: MessageVars,
): string {
  return translate(locale, `${base}.${pluralForm(locale, count)}`, { count, ...vars });
}

export function formatStorefrontMoney(amount: number, currency: string | null | undefined, locale: StorefrontLocale): string {
  const code = (currency || "NGN").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString(locale)}`;
  }
}

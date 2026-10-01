const PLATFORM_FALLBACK_CURRENCY = "NGN";

/**
 * The narrow symbol for an ISO currency code ("NGN" -> "₦", "KES" -> "KSh"),
 * or the code itself when the runtime doesn't recognise it. See
 * web/AGENTS.md for why storefront prices must never assume naira.
 */
export function currencySymbol(currency?: string | null): string {
  const code = (currency || PLATFORM_FALLBACK_CURRENCY).toUpperCase();

  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);

    return parts.find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

export function formatMoney(amount: number, currency?: string | null): string {
  return `${currencySymbol(currency)}${amount.toLocaleString()}`;
}

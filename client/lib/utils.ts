/**
 * Shared utility functions for the DumosRx client application.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDateLong } from "@/lib/utils/date-utils"
import { getActiveCurrency } from "@/lib/active-currency"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// CFA-zone currencies are conventionally written with the symbol after the amount (e.g.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-ts-L13
const CFA_SUFFIX_CODES = new Set(["XAF", "XOF"]);

// Normalizes a currency code before it's used anywhere below.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-ts-L18
function sanitizeCurrencyCode(currencyCode?: string) {
  const code = currencyCode || getActiveCurrency() || "NGN";
  return code.toUpperCase().replace(/[^A-Z]/g, "") || "NGN";
}

// True for currencies whose symbol is placed after the amount (see CFA_SUFFIX_CODES) — for callers building their own "symbol + value" strings…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-ts-L28
export function isCfaSuffixCurrency(currencyCode?: string) {
  return CFA_SUFFIX_CODES.has(sanitizeCurrencyCode(currencyCode));
}

function formatCfaSuffix(amount: number, maximumFractionDigits?: number) {
  const number = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(amount);
  return `${number} F`;
}

export function formatCurrency(amount: number, currencyCode?: string) {
  const code = sanitizeCurrencyCode(currencyCode);
  if (CFA_SUFFIX_CODES.has(code)) {
    // XAF/XOF are zero-minor-unit currencies - maximumFractionDigits left undefined here previously fell back to Intl's decimal-style default of 3…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-ts-L41
    return formatCfaSuffix(amount, 0);
  }
  // Simple mapping for common symbols if the locale doesn't handle it well but Intl.NumberFormat is generally robust.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-ts-L46
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  }
}

// Same as formatCurrency, but always rounds to whole units for currencies where sub-unit precision is no longer practically used (Naira, since…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-ts-L72
export function formatMetricCurrency(amount: number, currencyCode?: string) {
  const code = sanitizeCurrencyCode(currencyCode);
  if (CFA_SUFFIX_CODES.has(code)) {
    return formatCfaSuffix(amount, 0);
  }
  const noDecimalCurrencies = new Set(["NGN"]);
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: noDecimalCurrencies.has(code) ? 0 : undefined,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

// Just the currency symbol/prefix (e.g.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-ts-L101
export function getCurrencySymbol(currencyCode?: string) {
  const code = sanitizeCurrencyCode(currencyCode);
  if (CFA_SUFFIX_CODES.has(code)) {
    return "F";
  }
  try {
    const parts = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? "";
  } catch {
    const parts = new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? "";
  }
}


export function formatDateTime(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return formatDateLong(d, { withTime: true }) || String(dateStr);
  } catch (_e) {
    return String(dateStr);
  }
}

/**
 * Returns the current date in YYYY-MM-DD format based on the user's local timezone
 * rather than UTC. This prevents timezone offset bugs around midnight.
 */
export function getLocalTodayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if the current environment is a mobile device based on screen width and user agent.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.innerWidth < 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  );
}

// True only for a genuine Tauri-built binary running on a mobile OS — i.e.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-ts-L164
export function isNativeMobileApp(isTauriEnv: boolean, osType: string): boolean {
  return isTauriEnv && ["android", "ios"].includes(osType.toLowerCase());
}

/**
 * Extracts and formats user initials from their first and last name.
 * Defaults to "U" if no valid initials can be extracted.
 */
export function getUserInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.[0] || "";
  const l = lastName?.[0] || "";
  const initials = `${f}${l}`.toUpperCase();
  return initials || "U";
}

/**
 * Simple string pluralization based on count.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

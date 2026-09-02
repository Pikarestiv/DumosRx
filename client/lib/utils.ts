/**
 * Shared utility functions for the DumosRx client application.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDateLong } from "@/lib/utils/date-utils"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currencyCode: string = "NGN") {
  // Simple mapping for common symbols if the locale doesn't handle it well
  // but Intl.NumberFormat is generally robust.
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currencyCode.replace(/[^A-Z]/g, "") || "NGN", // Ensure valid 3-letter code
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Same as formatCurrency, but always rounds to whole units for currencies
 * where sub-unit precision is no longer practically used (Naira, since kobo
 * has fallen out of everyday use) — for dashboard/report metric cards where
 * a rounded headline figure reads cleaner than an exact-to-the-kobo total.
 * Line-item prices, cart totals, and receipts should keep using
 * formatCurrency() so accounting precision isn't lost there. */
export function formatMetricCurrency(amount: number, currencyCode: string = "NGN") {
  const code = currencyCode.replace(/[^A-Z]/g, "") || "NGN";
  const noDecimalCurrencies = new Set(["NGN"]);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: noDecimalCurrencies.has(code) ? 0 : undefined,
  }).format(amount);
}

/** Just the currency symbol/prefix (e.g. "₦", "$"), for compact chart-axis
 * labels ("₦12k") where the full formatCurrency() output would be too wide.
 * Derived from the same Intl formatter as formatCurrency() so the two never
 * disagree on which currency a store is actually using. */
export function getCurrencySymbol(currencyCode: string = "NGN") {
  const parts = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currencyCode.replace(/[^A-Z]/g, "") || "NGN",
    minimumFractionDigits: 0,
  }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? "";
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

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateDiscountPercent(monthlyPrice: number, yearlyPrice: number): number {
  if (!monthlyPrice || !yearlyPrice || monthlyPrice <= 0) return 0;
  const percent = Math.round(((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100);
  // A yearly price above 12x monthly is a misconfiguration, not a negative
  // discount: callers render this as a "Save X%" badge and hide it at 0, so
  // clamping is what makes the badge disappear instead of reading "-20%".
  return percent > 0 ? percent : 0;
}

/**
 * Quotes one CSV cell the way `app/admin/products/page.tsx` already does
 * (wrap in double quotes, double any inner quote) so a value containing a
 * comma, quote or newline can't shift the following columns, and neutralises
 * spreadsheet formula injection: Excel/Sheets execute a cell starting with
 * `=`, `+`, `-` or `@`, so those get a leading apostrophe.
 */
export function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function capitalizeFirstLetter(str: string | undefined | null): string {
  if (!str) return "";
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

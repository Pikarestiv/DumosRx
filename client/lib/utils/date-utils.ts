/**
 * Helper for Expiry Date Calculations
 */
import {
  addMonths,
  isBefore,
  differenceInDays,
  format,
  formatDistanceToNow,
} from "date-fns";

// `new Date("YYYY-MM-DD")` parses a bare date-only string as UTC midnight, which then compares against a local-time `now` - batches flip to "e…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-date-utils-L12
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const parseLocalDateOnly = (dateString: string): Date => {
  if (!DATE_ONLY_RE.test(dateString)) return new Date(dateString);
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getExpiryStatus = (expiryDate: string, warningMonths: number = 3) => {
  const date = parseLocalDateOnly(expiryDate);
  const now = new Date();
  const warningDate = addMonths(now, warningMonths);

  if (isBefore(date, now)) return "expired";
  if (isBefore(date, warningDate)) return "expiring_soon";
  return "healthy";
};

export const getDaysToExpiry = (expiryDate: string) => {
  return differenceInDays(parseLocalDateOnly(expiryDate), new Date());
};

/** Short "Weekday, D Mon" label, e.g. "Tue, 3 Sep" — used in the dashboard
 * header's date/clock strip. */
export const formatHeaderDate = (date: Date = new Date()): string => {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${weekday}, ${date.getDate()} ${month}`;
};

/**
 * Format a date string or object to DD/MM/YYYY.
 */
export const formatDateToDDMMYYYY = (date: string | Date | null | undefined): string => {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "";
    
    // We don't import format from date-fns directly here to avoid large bundles if not needed everywhere,
    // but we can use simple native formatting that strictly outputs DD/MM/YYYY.
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
};

const ordinalSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
};

// Format a date string or object as a long, unambiguously day-first string, e.g.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-date-utils-ts-L73
export const formatDateLong = (
  date: string | Date | null | undefined,
  opts?: { withTime?: boolean },
): string => {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "";

    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "long" });
    const year = d.getFullYear();
    let result = `${day}${ordinalSuffix(day)} ${month}, ${year}`;

    if (opts?.withTime) {
      const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      result += `, ${time}`;
    }

    return result;
  } catch {
    return "";
  }
};

// Format a date string with an arbitrary date-fns pattern, falling back to `fallback` instead of throwing/rendering "Invalid Date" for a null,…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-date-utils-ts-L103
export const formatDateSafe = (
  date: string | Date | null | undefined,
  pattern: string,
  fallback: string = "Unknown date",
): string => {
  if (!date) return fallback;
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return fallback;
    return format(d, pattern);
  } catch {
    return fallback;
  }
};

// Relative ("3 hours ago") counterpart to formatDateSafe:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-date-utils-ts-L123
export const formatDistanceSafe = (
  date: string | Date | null | undefined,
  fallback: string = "a while",
): string => {
  if (!date) return fallback;
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return fallback;
    return formatDistanceToNow(d);
  } catch {
    return fallback;
  }
};

/**
 * Parse a DD/MM/YYYY string to a Date object.
 */
export const parseDDMMYYYYToDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr.length !== 10) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // months are 0-indexed in JS
  const year = parseInt(parts[2], 10);
  
  const date = new Date(year, month, day);
  // Validate that the date hasn't rolled over (e.g., 31/02/2020 -> 02/03/2020)
  if (date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
    return date;
  }
  return null;
};

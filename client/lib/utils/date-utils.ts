/**
 * Helper for Expiry Date Calculations
 */
import { addMonths, isBefore, differenceInDays } from "date-fns";

export const getExpiryStatus = (expiryDate: string, warningMonths: number = 3) => {
  const date = new Date(expiryDate);
  const now = new Date();
  const warningDate = addMonths(now, warningMonths);

  if (isBefore(date, now)) return "expired";
  if (isBefore(date, warningDate)) return "expiring_soon";
  return "healthy";
};

export const getDaysToExpiry = (expiryDate: string) => {
  return differenceInDays(new Date(expiryDate), new Date());
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

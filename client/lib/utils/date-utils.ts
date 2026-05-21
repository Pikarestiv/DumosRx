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

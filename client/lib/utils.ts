/**
 * Shared utility functions for the DumosRx client application.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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

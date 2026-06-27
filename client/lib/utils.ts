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

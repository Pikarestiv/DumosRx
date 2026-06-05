import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateDiscountPercent(monthlyPrice: number, yearlyPrice: number): number {
  if (!monthlyPrice || !yearlyPrice || monthlyPrice <= 0) return 0;
  return Math.round(((monthlyPrice * 12 - yearlyPrice) / (monthlyPrice * 12)) * 100);
}

export function capitalizeFirstLetter(str: string | undefined | null): string {
  if (!str) return "";
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

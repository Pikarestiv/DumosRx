"use client";

const STORAGE_KEY = "dumosrx-checkout-details";

export interface SavedCheckoutDetails {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
}

const EMPTY: SavedCheckoutDetails = { customer_name: "", customer_phone: "", customer_email: "", customer_address: "" };

export function readSavedCheckoutDetails(): SavedCheckoutDetails {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<SavedCheckoutDetails>;
    return {
      customer_name: String(parsed.customer_name ?? ""),
      customer_phone: String(parsed.customer_phone ?? ""),
      customer_email: String(parsed.customer_email ?? ""),
      customer_address: String(parsed.customer_address ?? ""),
    };
  } catch {
    return EMPTY;
  }
}

export function saveCheckoutDetails(details: SavedCheckoutDetails): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    return;
  }
}

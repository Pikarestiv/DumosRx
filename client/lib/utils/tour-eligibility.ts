import { STORAGE_KEYS } from "@/lib/storage-keys";
const COMPLETED_KEY = STORAGE_KEYS.tourCompleted;
const SNOOZED_UNTIL_KEY = STORAGE_KEYS.tourSnoozedUntil;

export const TOUR_COMPLETED_KEY = COMPLETED_KEY;
export const TOUR_SNOOZED_UNTIL_KEY = SNOOZED_UNTIL_KEY;

export function isTourEligible(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (localStorage.getItem(COMPLETED_KEY)) return false;

    const snoozedUntil = Number.parseInt(
      localStorage.getItem(SNOOZED_UNTIL_KEY) ?? "",
      10,
    );
    if (Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

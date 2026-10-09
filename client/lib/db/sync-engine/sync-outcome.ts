import { STORAGE_KEYS } from "@/lib/storage-keys";
import { canonicaliseReason } from "./queue-state";
import type { SyncResult } from "./types";

/**
 * The last sync ATTEMPT, not the last success. `last_sync_time` is stamped
 * only when a round succeeds, so a device failing every round for two days
 * looked identical to one that simply had not synced — and the reason lived in
 * the indicator's React state and died on navigation. "Why do 50 changes keep
 * failing" was never answerable because of this gap.
 *
 * The reason is canonicalised: a raw sync error can be a driver message
 * quoting the attempted statement, which the diagnostics report must not carry.
 */
export interface SyncOutcome {
  at: string;
  success: boolean;
  pushed: number;
  pulled: number;
  reason: string | null;
}

export function recordSyncOutcome(result: SyncResult): void {
  if (typeof window === "undefined") return;

  const outcome: SyncOutcome = {
    at: new Date().toISOString(),
    success: result.success,
    pushed: result.pushed ?? 0,
    pulled: result.pulled ?? 0,
    reason: result.success
      ? null
      : canonicaliseReason(
          typeof result.error === "string"
            ? result.error
            : result.error
              ? String(result.error)
              : null,
        ),
  };

  try {
    localStorage.setItem(STORAGE_KEYS.lastSyncOutcome, JSON.stringify(outcome));
  } catch {
    /* storage unavailable; the outcome is a diagnostic, never load-bearing */
  }
}

export function readSyncOutcome(): SyncOutcome | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lastSyncOutcome);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SyncOutcome;
    return parsed?.at ? parsed : null;
  } catch {
    return null;
  }
}

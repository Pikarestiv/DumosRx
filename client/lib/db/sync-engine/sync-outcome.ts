import { STORAGE_KEYS } from "@/lib/storage-keys";
import { canonicaliseReason } from "./queue-state";
import { SYNC_DISABLED_IMPERSONATION_MESSAGE } from "@/lib/utils/impersonation";
import type { SyncResult } from "./types";

/** Defined here rather than in index.ts, which imports this module: the
 * NOT_AN_ATTEMPT set below needs it and a cycle would be fragile. index.ts
 * re-exports it, so its public name is unchanged. */
export const SYNC_IN_PROGRESS_ERROR = "Sync already in progress";

export const READ_ONLY_TAB_MESSAGE =
  "This tab is read-only. Switch to the tab where DumosRx is active to sync.";

/**
 * Pre-flight refusals, not attempts. Recording one would overwrite the real
 * outcome — and the two worst offenders fire during the very session that
 * reads it: an inspection session's own mount tick is refused as impersonated,
 * and a second PWA tab is refused as read-only while sharing this localStorage
 * key with the writer tab.
 */
const NOT_AN_ATTEMPT = new Set<string>([
  SYNC_IN_PROGRESS_ERROR,
  SYNC_DISABLED_IMPERSONATION_MESSAGE,
  READ_ONLY_TAB_MESSAGE,
]);

/**
 * `canonicaliseReason` knows the SERVER's refusal vocabulary, so every
 * sync-level failure collapsed to "other" — including the stuck-push case this
 * exists to diagnose. These are classified first, then it falls through.
 */
function classifyReason(error: unknown): string {
  const message = typeof error === "string" ? error : error ? String(error) : "";

  if (/^Offline/i.test(message) || /network|Failed to fetch/i.test(message)) {
    return "network";
  }
  if (/^Unauthenticated/i.test(message)) return "unauthenticated";
  if (/batch\(es\) failed to push/i.test(message)) return "batches_failed";
  if (/throttl/i.test(message)) return "throttled";

  return canonicaliseReason(message || null);
}

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
  if (typeof result.error === "string" && NOT_AN_ATTEMPT.has(result.error)) return;

  const outcome: SyncOutcome = {
    at: new Date().toISOString(),
    success: result.success,
    pushed: result.pushed ?? 0,
    pulled: result.pulled ?? 0,
    reason: result.success ? null : classifyReason(result.error),
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

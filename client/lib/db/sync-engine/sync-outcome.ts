import { STORAGE_KEYS } from "@/lib/storage-keys";
import { canonicaliseReason } from "./queue-state";
import { SYNC_DISABLED_IMPERSONATION_MESSAGE } from "@/lib/utils/impersonation";
import type { SyncResult } from "./types";
import { STORE_REFUSED_MESSAGE } from "./store-refusal";

// Defined here rather than in index.ts, which imports this module:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-sync-outcome-ts-L6
export const SYNC_IN_PROGRESS_ERROR = "Sync already in progress";

export const READ_ONLY_TAB_MESSAGE =
  "This tab is read-only. Switch to the tab where DumosRx is active to sync.";

// Pre-flight refusals, not attempts.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-sync-outcome-ts-L14
const NOT_AN_ATTEMPT = new Set<string>([
  SYNC_IN_PROGRESS_ERROR,
  SYNC_DISABLED_IMPERSONATION_MESSAGE,
  READ_ONLY_TAB_MESSAGE,
]);

// `canonicaliseReason` knows the SERVER's refusal vocabulary, so every sync-level failure collapsed to "other" — including the stuck-push case…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-sync-outcome-ts-L27
function classifyReason(error: unknown): string {
  const message = typeof error === "string" ? error : error ? String(error) : "";

  if (/^Offline/i.test(message) || /network|Failed to fetch/i.test(message)) {
    return "network";
  }
  if (/^Unauthenticated/i.test(message)) return "unauthenticated";
  if (/batch\(es\) failed to push/i.test(message)) return "batches_failed";
  if (/throttl/i.test(message)) return "throttled";
  if (message === STORE_REFUSED_MESSAGE) return "store_refused";

  return canonicaliseReason(message || null);
}

// The last sync ATTEMPT, not the last success.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-sync-outcome-L45
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

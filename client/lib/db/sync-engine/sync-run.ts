import { getActiveStoreId } from "../core";
import { getStoredActiveStoreId } from "@/lib/storage-keys";

/**
 * A sync run's identity: the token the server throttles by, and the store the
 * whole run belongs to. Why the store is decided once rather than read when
 * each request or report is built: docs/KNOWN_BUGS.md A-304.
 */
export interface SyncRun {
  id: string;
  storeId: string | null;
}

function newSyncRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The one place in the sync engine that reads the ambient active store —
 * pinned by `__tests__/sync-engine-store-identity.test.ts`. Everything else
 * takes the store from the run it was handed.
 */
export function resolveSyncRun(run?: SyncRun): SyncRun {
  if (run) {
    return run;
  }

  return {
    id: newSyncRunId(),
    storeId: getActiveStoreId() ?? getStoredActiveStoreId() ?? null,
  };
}

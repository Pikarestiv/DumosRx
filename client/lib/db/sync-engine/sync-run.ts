import { getActiveStoreId } from "../core";
import { getStoredActiveStoreId } from "@/lib/storage-keys";

// A sync run's identity:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-sync-run-ts-L4
export interface SyncRun {
  id: string;
  storeId: string | null;
}

function newSyncRunId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The one place in the sync engine that reads the ambient active store — pinned by `__tests__/sync-engine-store-identity.test.ts`.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-sync-run-ts-L20
export function resolveSyncRun(run?: SyncRun): SyncRun {
  if (run) {
    return run;
  }

  return {
    id: newSyncRunId(),
    storeId: getActiveStoreId() ?? getStoredActiveStoreId() ?? null,
  };
}

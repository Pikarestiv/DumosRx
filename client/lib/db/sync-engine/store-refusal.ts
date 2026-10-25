import type { PullResponse, SyncResult } from "./types";

export const STORE_REFUSED_MESSAGE =
  "Sync is paused: this device's store is no longer available to your account.";

export interface AccessibleStore {
  id: string;
  name: string;
}

export interface StoreRefusal {
  storeId: string;
  accessibleStores: AccessibleStore[];
}

function isLiveStore(row: Record<string, unknown>, refusedStoreId: string): boolean {
  return typeof row.id === "string" && row.id !== refusedStoreId && !row._deleted && !row.deleted_at;
}

// A-323: the stores the server still serves on a refused round are the ones this account can switch to.
export function readStoreRefusal(response: PullResponse, runStoreId: string | null): StoreRefusal | null {
  const refusedStoreId = response.refused_store_id;
  if (!refusedStoreId || refusedStoreId !== runStoreId) return null;

  const stores = Array.isArray(response.changes?.stores) ? response.changes.stores : [];

  return {
    storeId: refusedStoreId,
    accessibleStores: stores
      .filter((row) => isLiveStore(row, refusedStoreId))
      .map((row) => ({ id: row.id as string, name: typeof row.name === "string" ? row.name : "" })),
  };
}

export function refusedRound(pushed: number, pulled: number, refusal: StoreRefusal): SyncResult {
  return { success: false, pushed, pulled, error: STORE_REFUSED_MESSAGE, refusal };
}

import { apiClient } from "@/lib/api/client";
import { execute, getCurrentUserId, query } from "../core";
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
  storeDeleted?: boolean;
  reassignedStore?: AccessibleStore | null;
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
    storeDeleted: stores.some((row) => row.id === refusedStoreId && (!!row._deleted || !!row.deleted_at)),
  };
}

// Sign-in reads the local users row and a refused round never refreshes it, so the move is copied from /user.
export async function adoptReassignedStore(refusal: StoreRefusal): Promise<AccessibleStore | null> {
  const userId = getCurrentUserId();
  if (!userId) return null;

  const [local] = await query<{ store_id: string | null }>("SELECT store_id FROM users WHERE id = ?", [userId]);
  if (local?.store_id !== refusal.storeId) return null;

  const profile = (await apiClient.getProfile()) as { id?: string; store_id?: string | null };
  const target = refusal.accessibleStores.find((store) => store.id === profile?.store_id);
  if (profile?.id !== userId || !target) return null;

  await execute("UPDATE users SET store_id = ? WHERE id = ? AND store_id = ?", [target.id, userId, refusal.storeId]);
  return target;
}

export async function refusedRound(pushed: number, pulled: number, refusal: StoreRefusal): Promise<SyncResult> {
  const reassignedStore = await adoptReassignedStore(refusal).catch(() => null);
  return { success: false, pushed, pulled, error: STORE_REFUSED_MESSAGE, refusal: { ...refusal, reassignedStore } };
}

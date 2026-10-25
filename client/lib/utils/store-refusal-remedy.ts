import type { AccessibleStore, StoreRefusal } from "@/lib/db/sync-engine/store-refusal";

export interface StoreRefusalRemedy {
  message: string;
  switchTo: AccessibleStore | null;
}

const remedy = (message: string, switchTo: AccessibleStore | null = null): StoreRefusalRemedy => ({ message, switchTo });

export function storeRefusalRemedy(refusal: StoreRefusal, hasFixedStore: boolean): StoreRefusalRemedy {
  const [only, ...others] = refusal.accessibleStores;

  if (!only) return remedy("Ask the store owner to restore your access to keep syncing.");
  if (hasFixedStore) {
    return refusal.reassignedStore
      ? remedy(`Sign out and sign in again to move this till to ${refusal.reassignedStore.name || "your new store"}.`)
      : remedy("Ask the store owner which store this till should use.");
  }
  if (refusal.storeDeleted) return remedy("This store was deleted. Check the store menu for the store this device now uses.");
  if (others.length > 0) return remedy("Pick another store from the store menu to keep syncing.");

  return remedy(`Switch to ${only.name || "your other store"} to keep syncing.`, only);
}

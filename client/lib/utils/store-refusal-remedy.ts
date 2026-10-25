import type { AccessibleStore, StoreRefusal } from "@/lib/db/sync-engine/store-refusal";

export interface StoreRefusalRemedy {
  message: string;
  switchTo: AccessibleStore | null;
}

export function storeRefusalRemedy(refusal: StoreRefusal, hasFixedStore: boolean): StoreRefusalRemedy {
  const [only, ...others] = refusal.accessibleStores;

  if (hasFixedStore) {
    return { message: "Sign out and sign in again to load the store you now work at.", switchTo: null };
  }
  if (!only) {
    return { message: "Ask the store owner to restore your access to keep syncing.", switchTo: null };
  }
  if (others.length > 0) {
    return { message: "Pick another store from the store menu to keep syncing.", switchTo: null };
  }

  return { message: `Switch to ${only.name || "your other store"} to keep syncing.`, switchTo: only };
}

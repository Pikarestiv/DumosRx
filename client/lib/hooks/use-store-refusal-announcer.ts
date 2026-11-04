"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import type { StoreRefusal } from "@/lib/db/sync-engine/store-refusal";
import { storeRefusalRemedy } from "@/lib/utils/store-refusal-remedy";

// Module scope: several SyncIndicators are mounted at once and remount on navigation.
let announcedStoreId: string | null = null;

/** A-323: names a refused store once per store (every time on a manual sync) and offers the way back. */
export function useStoreRefusalAnnouncer() {
  const { user } = useAuth();
  const { switchStore } = useStore();

  const announce = useCallback(
    (refusal: StoreRefusal, errorMessage: string, isUserInitiated: boolean): string => {
      const remedy = storeRefusalRemedy(refusal, !!user?.store_id);

      if (isUserInitiated || announcedStoreId !== refusal.storeId) {
        announcedStoreId = refusal.storeId;
        const target = remedy.switchTo;
        toast.error(errorMessage, {
          description: remedy.message,
          action: target ? { label: `Switch to ${target.name || "store"}`, onClick: () => switchStore(target.id) } : undefined,
        });
      }

      return `${errorMessage} ${remedy.message}`;
    },
    [user?.store_id, switchStore],
  );

  const reset = useCallback(() => {
    announcedStoreId = null;
  }, []);

  return useMemo(() => ({ announce, reset }), [announce, reset]);
}

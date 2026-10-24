"use client";

import React, { createContext, useContext, useCallback, useMemo, ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";
import { update } from "@/lib/db/local-database";
import { setActiveStoreId as setResolvedStoreId } from "@/lib/db/core";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { clearLocalDrafts } from "@/lib/utils/clear-local-drafts";
import { setActiveCurrency } from "@/lib/active-currency";
import { getStoreById, getFirstStore, getAllStores } from "@/lib/db/queries/setup";
import { useAuth } from "@/lib/context/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { useWidgetSnapshotSync } from "@/lib/hooks/use-widget-snapshot-sync";
import { useWidgetDeeplink } from "@/lib/hooks/use-widget-deeplink";
import {
  getStoredActiveStoreId,
  setStoredActiveStoreId,
} from "@/lib/storage-keys";
import { terminology } from "@/lib/context/store-terminology";
import type { StoreContextType, StoreProfile, StoreType } from "@/lib/context/store-types";
import { useStoreBackgroundSync } from "@/lib/context/use-store-background-sync";

export type { StoreType, StoreProfile } from "@/lib/context/store-types";

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Upper bound on how long a store switch may hold the transition splash.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L117
const SWITCH_STORE_MAX_WAIT_MS = 5000;

// Hoisted so an unresolved store list hands every useStore() consumer the same
// array identity instead of a fresh [] on every provider render.
const NO_STORES: StoreProfile[] = [];

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, isHydrated: isAuthHydrated } = useAuth();
  // Lazy-initialized (not a useEffect) so the saved choice is already in state on the very first render, before `user` has even hydrated from it…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L159
  const [activeStoreId, setActiveStoreId] = React.useState<string | null>(() =>
    typeof window !== "undefined" ? getStoredActiveStoreId() : null,
  );

  // If user has a specific store_id (like a cashier), fetch that store.
  // Otherwise, use activeStoreId if set, else fallback to LIMIT 1
  const targetId = user?.store_id || activeStoreId;

  // Mirror this same precedence into the query layer's module-scope resolver (lib/db/core.ts):
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L177
  React.useEffect(() => {
    if (!isAuthHydrated) return;
    setResolvedStoreId(targetId);
  }, [targetId, isAuthHydrated]);

  const { data: storeProfile, isLoading: isStoreProfileLoading, refetch } = useQuery({
    ...queryKeys.stores.profile(targetId),
    enabled: isAuthHydrated,
    queryFn: async () => {
      if (targetId) {
        const profile = await getStoreById(targetId);
        if (profile) return profile;

        // The active/fixed store no longer exists locally, most likely pruned by the sync-engine's reconciliation step because the server no longer re…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L203
        if (!user?.store_id) {
          return getFirstStore();
        }
        return null;
      }
      return getFirstStore();
    }
  });

  // Not just isStoreProfileLoading:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L228
  const loading = !isAuthHydrated || isStoreProfileLoading;

  // During render, not in an effect: children format money in this same
  // commit. See lib/active-currency.ts.
  setActiveCurrency(storeProfile?.currency);

  React.useEffect(() => {
    Sentry.setTag("store_id", storeProfile?.id);
    Sentry.setTag("store_type", storeProfile?.store_type);
  }, [storeProfile]);

  // Set once on mount: distinguishes which physical device/terminal at a multi-device store a remote log came from, since store_id/user_id alone…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L247
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      Sentry.setTag("device_id", getDeviceId());
      Sentry.setTag("device_name", getDeviceLabel());
    }
  }, []);

  const { data: allStores } = useQuery({
    ...queryKeys.stores.all(user?.store_id),
    queryFn: async () => {
      if (user && !user.store_id) {
        const stores = await getAllStores();
        return stores || [];
      }
      return [];
    }
  });

  // Sync activeStoreId back whenever the resolved profile doesn't match targetId, for an owner/admin with no fixed store_id - covers both fallin…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L270
  const hasFixedStore = !!user?.store_id;
  const [fallbackCorrection, setFallbackCorrection] = React.useState<{ storeId: string } | null>(null);
  if (storeProfile && storeProfile.id !== targetId && !hasFixedStore) {
    setActiveStoreId(storeProfile.id);
    setFallbackCorrection({ storeId: storeProfile.id });
  }

  React.useEffect(() => {
    if (fallbackCorrection) setStoredActiveStoreId(fallbackCorrection.storeId);
  }, [fallbackCorrection]);

  const [isSwitchingStore, setIsSwitchingStore] = React.useState(false);

  const switchStore = useCallback((storeId: string) => {
    setActiveStoreId(storeId);
    if (typeof window !== "undefined") {
      setStoredActiveStoreId(storeId);
    }

    // Every store-scoped query reads the active store from lib/db/core.ts's module-scope resolver at call time, not from its React Query key (quer…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L304
    setResolvedStoreId(storeId);
    // Cancels in-flight fetches from the outgoing store before clearing:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L319
    setIsSwitchingStore(true);
    void (async () => {
      try {
        await Promise.race([
          queryClient.cancelQueries(),
          new Promise((resolve) => setTimeout(resolve, SWITCH_STORE_MAX_WAIT_MS)),
        ]);
        queryClient.clear();
        // A POS cart staged against the outgoing store's product ids must not survive into the newly-active store — it isn't scoped by store, and chec…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L357
        clearLocalDrafts();
      } finally {
        setIsSwitchingStore(false);
      }
    })();

    // Pulls this store's data down if this device has never synced it before (X-Store-Id now points at the newly-selected store; see lib/api/clien…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L367
    if (typeof window !== "undefined" && navigator.onLine) {
      import("@/lib/db/sync-engine").then(({ sync }) => sync()).catch(() => {});
    }
  }, []);
  const storeType = storeProfile?.store_type || "pharmacy";
  const theme = storeProfile?.theme || "default";
  const isInitialized = storeProfile?.is_initialized === 1;
  const vatPercentage = storeProfile?.vat_percentage ?? 0;

  // Apply theme class to root
  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      // Remove all previous theme classes (they start with theme-)
      const classes = Array.from(root.classList).filter(c => c.startsWith('theme-'));
      classes.forEach(c => root.classList.remove(c));
      
      if (theme !== 'default') {
        root.classList.add(`theme-${theme}`);
      }
    }
  }, [theme]);

  useStoreBackgroundSync(refetch);

  const updateStoreProfile = useCallback(async (data: Partial<StoreProfile>) => {
    // Every real caller of this is a settings write against an ALREADY onboarded store (theme toggle, loyalty settings, payment config, ...) - onb…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L489
    if (!storeProfile) {
      console.error(
        "[StoreContext] updateStoreProfile called with no storeProfile loaded - write skipped:",
        data,
      );
      return;
    }
    await update("stores", storeProfile.id, data);
    await refetch();
  }, [storeProfile, refetch]);

  const setTheme = useCallback((newTheme: string) => {
    // Fire-and-forget by design (the UI applies the theme immediately, optimistically) — but a failed write must not fail silently, or the display…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L511
    updateStoreProfile({ theme: newTheme }).catch((err) => {
      console.error("[StoreContext] Failed to persist theme change:", err);
      toast.error("Couldn't save your theme choice — it may not stick after reload.");
    });
  }, [updateStoreProfile]);

  const t = useCallback(
    (key: string): string => {
      const type = storeType as StoreType;
      return terminology[type]?.[key] || terminology["retail"][key] || key;
    },
    [storeType],
  );

  useWidgetSnapshotSync();
  useWidgetDeeplink();

  const resolvedActiveStoreId = user?.store_id || activeStoreId;
  const availableStores = allStores || NO_STORES;

  const value = useMemo<StoreContextType>(
    () => ({
      storeProfile: storeProfile ?? null,
      loading,
      storeType,
      theme,
      isInitialized,
      vatPercentage,
      updateStoreProfile,
      setTheme,
      t,
      activeStoreId: resolvedActiveStoreId,
      availableStores,
      switchStore,
      isSwitchingStore,
      refetch,
    }),
    [
      storeProfile,
      loading,
      storeType,
      theme,
      isInitialized,
      vatPercentage,
      updateStoreProfile,
      setTheme,
      t,
      resolvedActiveStoreId,
      availableStores,
      switchStore,
      isSwitchingStore,
      refetch,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}

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
import { devLog } from "@/lib/utils/dev-log";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { useWidgetSnapshotSync } from "@/lib/hooks/use-widget-snapshot-sync";
import { useWidgetDeeplink } from "@/lib/hooks/use-widget-deeplink";
import { APP_EVENTS, onAppEvent } from "@/lib/events";
import {
  getStoredActiveStoreId,
  setStoredActiveStoreId,
  getAuthToken,
} from "@/lib/storage-keys";
import { terminology } from "@/lib/context/store-terminology";

export type StoreType = "pharmacy" | "grocery" | "supermarket" | "retail";

export interface StoreProfile {
  id: string;
  name: string;
  store_type: StoreType;
  is_initialized: number;
  currency: string;
  vat_percentage: number;
  theme: string;
  location?: string;
  address?: string;
  phone?: string;
  email?: string;
  pcn_license?: string;
  registration_number?: string;
  tax_number?: string;
  reseller_commission_percentage?: number;
  custom_units?: string;
  receipt_header?: string;
  receipt_footer?: string;
  receipt_tagline?: string;
  show_logo_on_receipt?: number;
  receipt_logo_position?: "above" | "beside";
  show_contact_on_receipt?: number;
  show_phone_on_receipt?: number;
  show_address_on_receipt?: number;
  show_barcode_on_receipt?: number;
  hide_powered_by?: number;
  low_stock_warning?: number;
  expiry_warning?: number;
  expiry_warning_days?: number;
  logo_url?: string;
  auto_sync_enabled?: number;
  auto_sync_interval?: number;
  subscription_tier?: "free" | "local" | "pro" | "enterprise";
  status?: "Active" | "Suspended";
  suspension_reason?: string;
  show_retail_suggestions?: number;
  require_payment_account?: number;
  enabled_payment_methods?: string;
  online_store_enabled?: number;
  loyalty_program_enabled?: number;
  loyalty_points_per_currency?: number;
  uppercase_display_enabled?: number;
  store_slug?: string;
  // Server-set by the online-payment onboarding endpoint and pulled down by sync; read-only here (nothing in this app may write them, see client…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L73
  paystack_subaccount_code?: string | null;
  paystack_bank_code?: string | null;
  paystack_account_number_last4?: string | null;
  // Server-set the last time store_slug actually changed (not on the first-ever set) - drives the Settings UI's "you can change this again on [d…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L80
  store_slug_changed_at?: string | null;
  updated_at?: string;
  license_token?: string;
  last_monotonic_time?: string;
  device_id?: string;
  is_demo?: number;
  require_sale_notes?: number;
  display_stock_levels?: number;
  // Off by default: whether non-admin staff (specialist, sales_staff) can use the POS header's "Request stock from another store" button.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L91
  staff_can_request_transfers?: number;
  // Off by default: gates the POS cart's "Reseller sale" row (both the reseller-commission and store-markup sub-types) - see isMarkupSalesEnable…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L96
  markup_sales_enabled?: number;
}

interface StoreContextType {
  storeProfile: StoreProfile | null;
  loading: boolean;
  storeType: StoreType;
  theme: string;
  isInitialized: boolean;
  vatPercentage: number;
  updateStoreProfile: (data: Partial<StoreProfile>) => Promise<void>;
  setTheme: (theme: string) => void;
  t: (key: string) => string;
  activeStoreId: string | null;
  availableStores: StoreProfile[];
  switchStore: (storeId: string) => void;
  // True for the duration of switchStore()'s async work (cancel + clear).
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L115
  isSwitchingStore: boolean;
  refetch: () => Promise<unknown>;
}

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
  if (storeProfile && storeProfile.id !== targetId && !hasFixedStore) {
    setActiveStoreId(storeProfile.id);
  }

  React.useEffect(() => {
    if (activeStoreId && !hasFixedStore) setStoredActiveStoreId(activeStoreId);
  }, [activeStoreId, hasFixedStore]);

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

  // Trigger sync on mount and when network goes online
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const triggerSync = async () => {
      const token = getAuthToken();
      if (navigator.onLine && token) {
        devLog("[StoreContext] Network online or app mounted: triggering sync");
        try {
          const { sync } = await import("@/lib/db/sync-engine");
          const result = await sync();
          if (result.success) {
            devLog("[StoreContext] Sync successful, refetching local store profile");
            await refetch();
            // Self-gated to once per 24h; a no-op on every other call here.
            // See health-check.ts's own doc comment for why this exists.
            const { checkSyncHealth } = await import("@/lib/db/sync-engine/health-check");
            void checkSyncHealth();
          }
        } catch (e) {
          console.error("[StoreContext] Auto-sync failed", e);
        }
      }
    };

    void triggerSync();

    const handleOnline = () => {
      void triggerSync();
    };

    const handleSyncCompleted = () => {
      devLog("[StoreContext] Received sync completed event, refetching local store profile");
      void refetch();
    };

    window.addEventListener("online", handleOnline);
    const unsubscribeSyncCompleted = onAppEvent(
      APP_EVENTS.syncCompleted,
      handleSyncCompleted,
    );
    return () => {
      window.removeEventListener("online", handleOnline);
      unsubscribeSyncCompleted();
    };
  }, [refetch]);

  // Privileged subscription status sync:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-store-context-tsx-L447
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const runSubscriptionSync = async () => {
      const token = getAuthToken();
      if (!navigator.onLine || !token) return;
      try {
        const { syncSubscriptionStatus } = await import("@/lib/db/sync-engine");
        const result = await syncSubscriptionStatus();
        if (result.updated) {
          devLog("[StoreContext] Subscription status updated from server, refetching profile");
          await refetch();
        }
      } catch (e) {
        console.error("[StoreContext] Subscription status sync failed", e);
      }
    };

    // Run immediately on mount
    void runSubscriptionSync();

    // Then every 30 minutes
    const interval = setInterval(() => {
      void runSubscriptionSync();
    }, 30 * 60 * 1000);

    // Also re-run when the app comes back online
    const handleOnline = () => {
      void runSubscriptionSync();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
    };
  }, [refetch]);

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

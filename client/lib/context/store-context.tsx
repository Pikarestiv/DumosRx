"use client";

import React, { createContext, useContext, ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { update, insert } from "@/lib/db/local-database";
import { setActiveStoreId as setResolvedStoreId } from "@/lib/db/core";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { getStoreById, getFirstStore, getAllStores } from "@/lib/db/queries/setup";
import { useAuth } from "@/lib/context/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { devLog } from "@/lib/utils/dev-log";
import { getDeviceId } from "@/lib/utils/device-id";
import { useWidgetSnapshotSync } from "@/lib/hooks/use-widget-snapshot-sync";
import { useWidgetDeeplink } from "@/lib/hooks/use-widget-deeplink";

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
  show_contact_on_receipt?: number;
  show_phone_on_receipt?: number;
  show_address_on_receipt?: number;
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
  updated_at?: string;
  license_token?: string;
  last_monotonic_time?: string;
  device_id?: string;
  is_demo?: number;
  require_sale_notes?: number;
  display_stock_levels?: number;
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
  /**
   * True for the duration of switchStore()'s async work (cancel + broad
   * invalidate). React Query's invalidateQueries() marks queries stale and
   * refetches in the background *without* clearing what's already rendered,
   * so between the switch and the refetch resolving, screens can still be
   * painting the previous store's data. Consumers (LicenseGuard) show a
   * splash instead of that window. Defense-in-depth: the window has never
   * been reproduced on a test device, but it's real by design.
   */
  isSwitchingStore: boolean;
  refetch: () => Promise<unknown>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Upper bound on how long a store switch may hold the transition splash.
// Purely a stuck-state guard, not a tuned delay - the local-first query
// layer normally settles far inside it.
const SWITCH_STORE_MAX_WAIT_MS = 5000;

const terminology: Record<StoreType, Record<string, string>> = {
  pharmacy: {
    product: "Product",
    products: "Products",
    registration_number: "NAFDAC Number",
    category: "Therapeutic Class",
    stock: "Stock Level",
  },
  grocery: {
    product: "Item",
    products: "Items",
    registration_number: "Registration No.",
    category: "Department",
    stock: "Quantity",
  },
  supermarket: {
    product: "Product",
    products: "Products",
    registration_number: "Reg. Number",
    category: "Aisle/Category",
    stock: "Stock",
  },
  retail: {
    product: "Product",
    products: "Products",
    registration_number: "Reg. No",
    category: "Category",
    stock: "Stock",
  },
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Lazy-initialized (not a useEffect) so the saved choice is already in
  // state on the very first render, before `user` has even hydrated from
  // its own localStorage read. Previously this started at null and was
  // only populated by a later effect gated on `user`. During that gap,
  // targetId below was null, so the profile query fell back to
  // getFirstStore() (arbitrary row), and the "sync activeStoreId back"
  // effect further down then persisted THAT as the real choice, silently
  // overwriting a real selection (e.g. from the multi-store cloud-restore
  // picker) with whatever SQLite happened to return first. Reading
  // synchronously here closes that window instead of racing it.
  const [activeStoreId, setActiveStoreId] = React.useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("dumos_active_store_id") : null,
  );

  // If user has a specific store_id (like a cashier), fetch that store.
  // Otherwise, use activeStoreId if set, else fallback to LIMIT 1
  const targetId = user?.store_id || activeStoreId;

  // Mirror this same precedence into the query layer's module-scope resolver
  // (lib/db/core.ts): plain async query functions have no React context, so
  // this is how they learn which store to filter by. Must stay in lockstep
  // with `targetId` above: a staff member's fixed store_id always wins.
  React.useEffect(() => {
    setResolvedStoreId(targetId);
  }, [targetId]);

  const { data: storeProfile, isLoading: loading, refetch } = useQuery({
    ...queryKeys.stores.profile(targetId),
    queryFn: async () => {
      if (targetId) {
        const profile = await getStoreById(targetId);
        if (profile) return profile;

        // The active/fixed store no longer exists locally, most likely
        // pruned by the sync-engine's reconciliation step because the
        // server no longer recognizes it (a stale local-only store, or one
        // this account lost access to). For an owner/admin (no fixed
        // store_id), fall back to whatever store IS still known rather than
        // getting stuck showing nothing. A staff member's fixed store_id
        // genuinely disappearing is a deeper problem worth surfacing, not
        // papering over the same way.
        if (!user?.store_id) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("dumos_active_store_id");
          }
          setActiveStoreId(null);
          return getFirstStore();
        }
        return null;
      }
      return getFirstStore();
    }
  });

  React.useEffect(() => {
    Sentry.setTag("store_id", storeProfile?.id);
    Sentry.setTag("store_type", storeProfile?.store_type);
  }, [storeProfile]);

  // Set once on mount: distinguishes which physical device/terminal at a
  // multi-device store a remote log came from, since store_id/user_id alone
  // are shared across every device tied to that store.
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      Sentry.setTag("device_id", getDeviceId());
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



  // Sync activeStoreId back if we fell back to LIMIT 1
  React.useEffect(() => {
    if (storeProfile && !targetId && (!user || !user.store_id)) {
       setActiveStoreId(storeProfile.id);
       if (typeof window !== "undefined") {
         localStorage.setItem("dumos_active_store_id", storeProfile.id);
       }
    }
  }, [storeProfile, targetId, user]);

  const [isSwitchingStore, setIsSwitchingStore] = React.useState(false);

  const switchStore = (storeId: string) => {
    setActiveStoreId(storeId);
    if (typeof window !== "undefined") {
      localStorage.setItem("dumos_active_store_id", storeId);
    }

    // Every store-scoped query reads the active store from lib/db/core.ts's
    // module-scope resolver at call time, not from its React Query key, so
    // without this, screens would keep showing the previous store's cached
    // results until something else happened to invalidate them. Broad
    // invalidation (not a table-filtered one) because switching stores is a
    // deliberate, infrequent action, not a hot path; correctness here is
    // worth more than avoiding a refetch.
    //
    // Must set the resolver synchronously here rather than relying on the
    // useEffect above (which mirrors targetId into it): that effect only
    // runs after React commits the re-render, which is after
    // invalidateQueries() below has already kicked off refetches. Without
    // this, those refetches would read the OLD store id (stale resolver),
    // cache the old store's data under the same query keys, and never
    // refetch again: the exact "needs a reload to reflect" bug.
    setResolvedStoreId(storeId);
    // Cancels in-flight fetches from the outgoing store before
    // invalidating: invalidateQueries() alone doesn't abort a request
    // already in flight, and every query function reads the active store
    // id from lib/db/core.ts's module-level resolver at execution time
    // rather than from its React Query key. Without this, a request
    // issued (and still pending) before the switch could resolve after
    // resolvedStoreId flips and get cached as "fresh" under a store-
    // unscoped key, momentarily showing the previous store's data.
    // Hold a transition state until the cancel + invalidate round trip has
    // settled, so nothing renders the outgoing store's still-cached data
    // while its refetch is in flight. Capped by a timeout: a query that
    // never settles must not strand the app on the splash screen - falling
    // back to the (at worst briefly stale) UI is better than a stuck one.
    setIsSwitchingStore(true);
    void (async () => {
      try {
        await queryClient.cancelQueries();
        await Promise.race([
          queryClient.invalidateQueries(),
          new Promise((resolve) => setTimeout(resolve, SWITCH_STORE_MAX_WAIT_MS)),
        ]);
      } finally {
        setIsSwitchingStore(false);
      }
    })();

    // Pulls this store's data down if this device has never synced it
    // before (X-Store-Id now points at the newly-selected store; see
    // lib/api/client.ts). Best-effort: offline/unauthenticated devices still
    // work from whatever's already local. Guarded on navigator.onLine (like
    // the mount-time triggerSync effect below) so switching stores while
    // offline doesn't attempt a doomed fetch — every queued item across
    // however many tables have pending changes would otherwise fail with
    // "Failed to fetch" and burn through the sync-queue's retry backoff for
    // no reason, eventually firing a spurious "stuck sync" crash report for
    // what is, correctly, just this being an offline-first app.
    if (typeof window !== "undefined" && navigator.onLine) {
      import("@/lib/db/sync-engine").then(({ sync }) => sync()).catch(() => {});
    }
  };
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
      const token = localStorage.getItem("auth_token");
      if (navigator.onLine && token) {
        devLog("[StoreContext] Network online or app mounted: triggering sync");
        try {
          const { sync } = await import("@/lib/db/sync-engine");
          const result = await sync();
          if (result.success) {
            devLog("[StoreContext] Sync successful, refetching local store profile");
            await refetch();
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
    window.addEventListener("dumos_sync_completed", handleSyncCompleted);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("dumos_sync_completed", handleSyncCompleted);
    };
  }, [refetch]);

  // Privileged subscription status sync: always runs regardless of tier,
  // so plan downgrades, suspensions, and renewals written on the server
  // are reflected locally even when full cloud sync is gated off.
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const runSubscriptionSync = async () => {
      const token = localStorage.getItem("auth_token");
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

  const updateStoreProfile = async (data: Partial<StoreProfile>) => {
    if (!storeProfile) {
      await insert("stores", {
        id: "default",
        name: "My Store",
        store_type: "pharmacy",
        is_initialized: 0,
        vat_percentage: 0,
        currency: "NGN",
        theme: "default",
        ...data,
      });
    } else {
      await update("stores", storeProfile.id, data);
    }
    await refetch();
  };

  const setTheme = (newTheme: string) => {
    void updateStoreProfile({ theme: newTheme });
  };

  const t = (key: string): string => {
    const type = storeType as StoreType;
    return terminology[type]?.[key] || terminology["retail"][key] || key;
  };

  useWidgetSnapshotSync();
  useWidgetDeeplink();

  return (
    <StoreContext.Provider
      value={{
        storeProfile: storeProfile ?? null,
        loading,
        storeType,
        theme,
        isInitialized,
        vatPercentage,
        updateStoreProfile,
        setTheme,
        t,
        activeStoreId: user?.store_id || activeStoreId,
        availableStores: allStores || [],
        switchStore,
        isSwitchingStore,
        refetch,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}

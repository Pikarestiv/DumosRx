"use client";

import React from "react";
import { devLog } from "@/lib/utils/dev-log";
import { APP_EVENTS, onAppEvent } from "@/lib/events";
import { getAuthToken } from "@/lib/storage-keys";

const SUBSCRIPTION_SYNC_INTERVAL_MS = 30 * 60 * 1000;

export function useStoreBackgroundSync(refetch: () => Promise<unknown>) {
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

    void runSubscriptionSync();
    const interval = setInterval(() => {
      void runSubscriptionSync();
    }, SUBSCRIPTION_SYNC_INTERVAL_MS);

    const handleOnline = () => {
      void runSubscriptionSync();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
    };
  }, [refetch]);
}

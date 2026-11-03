"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import {
  sync,
  isSyncing as checkIsSyncing,
  SYNC_IN_PROGRESS_ERROR,
} from "@/lib/db/sync-engine";
import { addSyncQueueChangeListener } from "@/lib/db/core";
import {
  CRASH_REPORT_TABLE,
  hasPendingNonCrashFeedback,
} from "@/lib/db/crash-report-sync";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useDatabase } from "@/lib/db/DatabaseProvider";
import { isExpectedPlanRestriction } from "@/lib/utils/error-logger";
import { queryKeys } from "@/lib/query-keys";
import { APP_EVENTS, onAppEvent } from "@/lib/events";
import { getAuthToken, getLastSyncTime } from "@/lib/storage-keys";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useStoreRefusalAnnouncer } from "@/lib/hooks/use-store-refusal-announcer";

const INSTANT_SYNC_DEBOUNCE_MS = 2000;
const SYNC_OVERDUE_MS = 30 * 60 * 1000;

export type SyncConnectionStatus = "online" | "offline" | "syncing" | "error";

function useSyncQueueCount() {
  const { data, refetch } = useQuery({
    ...queryKeys.sync.queueCount(),
    queryFn: () => getSyncQueueCount(),
    // Safety net only; the count is event-driven (listener below).
    refetchInterval: 30000,
  });

  useEffect(() => {
    return addSyncQueueChangeListener(() => {
      void refetch?.();
    });
  }, [refetch]);

  return data || 0;
}

export function useSyncIndicatorState() {
  const hydrated = useHydrated();
  const [observedStatus, setStatus] = useState<SyncConnectionStatus | null>(null);
  const [observedLastSync, setLastSync] = useState<string | null>(null);
  const [isSyncInProgress, setIsSyncInProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [observedIsLinked, setIsLinked] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { storeProfile } = useStore();
  // sync() enforces the same rule; this only makes the refusal visible.
  const { isImpersonating } = useAuth();
  const { isReadOnlyTab } = useDatabase();
  const pendingCount = useSyncQueueCount();
  const storeRefusal = useStoreRefusalAnnouncer();

  const status: SyncConnectionStatus =
    observedStatus ?? (hydrated && !navigator.onLine ? "offline" : "online");
  const isLinked = observedIsLinked ?? (hydrated && !!getAuthToken());
  const lastSync = observedLastSync ?? (hydrated ? getLastSyncTime() : null);

  const isSyncOverdue = lastSync
    ? now - new Date(lastSync).getTime() > SYNC_OVERDUE_MS
    : false;

  useEffect(() => {
    const updateOnlineStatus = () => {
      setStatus(navigator.onLine ? "online" : "offline");
      setIsLinked(!!getAuthToken());
    };
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    const unsubscribeTokenSet = onAppEvent(APP_EVENTS.authTokenSet, updateOnlineStatus);
    const unsubscribeTokenCleared = onAppEvent(APP_EVENTS.authTokenCleared, updateOnlineStatus);

    const interval = setInterval(() => {
      const stored = getLastSyncTime();
      if (stored) setLastSync(stored);
      setIsSyncInProgress(checkIsSyncing());
      setNow(Date.now());
    }, 2000);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      unsubscribeTokenSet();
      unsubscribeTokenCleared();
      clearInterval(interval);
    };
  }, []);

  // `isUserInitiated` must stay false for every background caller — see
  // client/AGENTS.md, "The sync indicator", and docs/FIXED_BUGS.md A-5.
  const runSync = useCallback(async (isUserInitiated: boolean) => {
    if (isImpersonating) {
      if (isUserInitiated) toast.info("Sync is disabled during an impersonated session.");
      return;
    }
    if (isReadOnlyTab) {
      if (isUserInitiated) {
        toast.info("This tab is read-only. Switch to the tab where DumosRx is active to sync.");
      }
      return;
    }
    if (isSyncInProgress) return;
    setIsSyncInProgress(true);
    setStatus("syncing");
    try {
      const result = await sync(isUserInitiated);
      if (result.success) {
        setStatus("online");
        setLastSync(new Date().toISOString());
        setErrorMessage(null);
        storeRefusal.reset();
        if (isUserInitiated) toast.success("Sync completed successfully");
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : "Sync failed";
        // Another caller holds the mutex and reports its own outcome.
        if (errorMsg === SYNC_IN_PROGRESS_ERROR) return;
        if (!isUserInitiated && isExpectedPlanRestriction(errorMsg)) {
          setStatus("online");
          return;
        }
        setStatus("error");
        setErrorMessage(result.refusal ? storeRefusal.announce(result.refusal, errorMsg, isUserInitiated) : errorMsg);
        if (errorMsg.includes("Unauthenticated") || errorMsg.includes("401")) {
          setShowAuthModal(true);
        }
      }
    } catch (err) {
      console.error("Sync failed:", err);
      if (!isUserInitiated && isExpectedPlanRestriction(err)) {
        setStatus("online");
        return;
      }
      setStatus("error");
      const message = err instanceof Error ? err.message : "";
      setErrorMessage(message.includes("Unauthenticated")
        ? "Cloud Account Unauthenticated. Please re-link in settings."
        : "Sync failed. Check your connection.");

      if (message.includes("Unauthenticated") || message.includes("401")) {
        setShowAuthModal(true);
      }
    } finally {
      setIsSyncInProgress(false);
    }
  }, [isSyncInProgress, isImpersonating, isReadOnlyTab, storeRefusal]);

  const handleManualSync = useCallback(() => runSync(true), [runSync]);

  // Background auto-sync daemon: instant mode when auto_sync_interval is 0,
  // otherwise an N-minute poll (client/AGENTS.md, "The sync indicator").
  useEffect(() => {
    let autoSyncIntervalTimer: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;
    let disposed = false;

    if (storeProfile?.auto_sync_enabled === 1 && isLinked && !isImpersonating && !isReadOnlyTab) {
      const intervalMinutes = storeProfile?.auto_sync_interval ?? 15;

      if (intervalMinutes === 0) {
        const scheduleInstantSync = () => {
          if (disposed) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (navigator.onLine && !checkIsSyncing()) {
              console.log("Auto-sync triggered (instant, on change)");
              void runSync(false);
            }
          }, INSTANT_SYNC_DEBOUNCE_MS);
        };

        unsubscribe = addSyncQueueChangeListener((tables) => {
          // audit_logs-only churn is telemetry; it rides the next real sync.
          // See client/AGENTS.md "The sync indicator" for the full rationale.
          const triggerWorthy = tables.filter((t) => t !== "audit_logs");
          if (triggerWorthy.length === 0) return;

          // A crash-report-only batch also rides the next real sync rather than triggering its own; user-submitted feedback still tr…
          // Rationale: docs/CLIENT_COMMENTS.md#line-components-dashboard-sync-indicator-tsx-L212
          if (triggerWorthy.every((t) => t === CRASH_REPORT_TABLE)) {
            void hasPendingNonCrashFeedback().then((userSubmitted) => {
              if (userSubmitted) scheduleInstantSync();
            });
            return;
          }

          scheduleInstantSync();
        });
      } else {
        const intervalMs = intervalMinutes * 60 * 1000;
        autoSyncIntervalTimer = setInterval(() => {
          if (navigator.onLine && !checkIsSyncing()) {
            console.log(`Auto-sync triggered (${intervalMinutes} min interval)`);
            void runSync(false);
          }
        }, intervalMs);
      }
    }

    return () => {
      disposed = true;
      if (autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe?.();
    };
  }, [storeProfile?.auto_sync_enabled, storeProfile?.auto_sync_interval, isLinked, isImpersonating, isReadOnlyTab, runSync]);

  return {
    status,
    lastSync,
    isSyncInProgress,
    errorMessage,
    showAuthModal,
    setShowAuthModal,
    isLinked,
    isImpersonating,
    pendingCount,
    isSyncOverdue,
    handleManualSync,
  };
}

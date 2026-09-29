"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

import {
  sync,
  isSyncing as checkIsSyncing,
  SYNC_IN_PROGRESS_ERROR,
} from "@/lib/db/sync-engine";
import { addSyncQueueChangeListener } from "@/lib/db/core";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useDatabase } from "@/lib/db/DatabaseProvider";
import { AuthModal } from "./auth-modal";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { isExpectedSyncRestriction } from "@/lib/utils/error-logger";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { APP_EVENTS, onAppEvent } from "@/lib/events";
import {
  getAuthToken,
  getLastSyncTime,
} from "@/lib/storage-keys";

// A burst of local writes collapses into one sync call, not one per row.
const INSTANT_SYNC_DEBOUNCE_MS = 2000;

const SolidAlertCircle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" />
  </svg>
);

export function SyncIndicator({ collapsed = false, isMobileHeader = false }: { collapsed?: boolean; isMobileHeader?: boolean }) {
  const [status, setStatus] = useState<
    "online" | "offline" | "syncing" | "error"
  >("online");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isSyncInProgress, setIsSyncInProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const { storeProfile } = useStore();
  // sync() enforces the same rule; this only makes the refusal visible.
  const { isImpersonating } = useAuth();
  // Same reasoning as isImpersonating above, for a read-only tab.
  const { isReadOnlyTab } = useDatabase();

  const { data: pendingCountData, refetch: refetchPendingCount } = useQuery({
    ...queryKeys.sync.queueCount(),
    queryFn: () => getSyncQueueCount(),
    // Safety net only; the count is event-driven (listener below).
    refetchInterval: 30000,
  });
  const pendingCount = pendingCountData || 0;

  const refetchPendingCountRef = useRef(refetchPendingCount);
  refetchPendingCountRef.current = refetchPendingCount;

  useEffect(() => {
    return addSyncQueueChangeListener(() => {
      void refetchPendingCountRef.current?.();
    });
  }, []);

  const isSyncOverdue = lastSync
    ? Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000
    : false;

  // Backlog alone drives visibility; isSyncOverdue only escalates urgency.
  const needsSync = pendingCount > 0;

  useEffect(() => {
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    const unsubscribeTokenSet = onAppEvent(APP_EVENTS.authTokenSet, updateOnlineStatus);
    const unsubscribeTokenCleared = onAppEvent(
      APP_EVENTS.authTokenCleared,
      updateOnlineStatus,
    );

    const interval = setInterval(() => {
      const stored = getLastSyncTime();
      if (stored) setLastSync(stored);
      setIsSyncInProgress(checkIsSyncing());
    }, 2000);

    const stored = getLastSyncTime();
    if (stored) setLastSync(stored);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      unsubscribeTokenSet();
      unsubscribeTokenCleared();
      clearInterval(interval);
    };
  }, []);

  const updateOnlineStatus = () => {
    setStatus(navigator.onLine ? "online" : "offline");
    const token = getAuthToken();
    setIsLinked(!!token);
  };

  // `isUserInitiated` must stay false for every background caller — see
  // client/AGENTS.md, "The sync indicator", and docs/FIXED_BUGS.md A-5.
  const runSync = useCallback(async (isUserInitiated: boolean) => {
    // Toasted rather than silent, so a superadmin isn't left wondering why
    // the indicator looks frozen.
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
        if (isUserInitiated) toast.success("Sync completed successfully");
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : "Sync failed";
        // Another caller holds the mutex and reports its own outcome.
        if (errorMsg === SYNC_IN_PROGRESS_ERROR) return;
        if (!isUserInitiated && isExpectedSyncRestriction(errorMsg)) {
          setStatus("online");
          return;
        }
        setStatus("error");
        setErrorMessage(errorMsg);
        if (errorMsg.includes("Unauthenticated") || errorMsg.includes("401")) {
          setShowAuthModal(true);
        }
      }
    } catch (err) {
      console.error("Sync failed:", err);
      if (!isUserInitiated && isExpectedSyncRestriction(err)) {
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
  }, [isSyncInProgress, isImpersonating, isReadOnlyTab]);

  const handleManualSync = useCallback(() => runSync(true), [runSync]);

  // Background auto-sync daemon: instant mode when auto_sync_interval is 0,
  // otherwise an N-minute poll (client/AGENTS.md, "The sync indicator").
  useEffect(() => {
    let autoSyncIntervalTimer: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;

    // Neither mode is installed at all while impersonating or read-only.
    if (storeProfile?.auto_sync_enabled === 1 && isLinked && !isImpersonating && !isReadOnlyTab) {
      const intervalMinutes = storeProfile?.auto_sync_interval ?? 15;

      if (intervalMinutes === 0) {
        unsubscribe = addSyncQueueChangeListener((tables) => {
          // audit_logs-only churn is telemetry; it rides the next real sync.
          if (tables.every((t) => t === "audit_logs")) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (navigator.onLine && !checkIsSyncing()) {
              console.log("Auto-sync triggered (instant, on change)");
              void runSync(false);
            }
          }, INSTANT_SYNC_DEBOUNCE_MS);
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
      if (autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe?.();
    };
  }, [storeProfile?.auto_sync_enabled, storeProfile?.auto_sync_interval, isLinked, isImpersonating, isReadOnlyTab, runSync]);

  // Impersonation wins over every other state: no sync will run at all.
  const stateKey = isImpersonating
    ? "impersonating"
    : isSyncInProgress
    ? "syncing"
    : status === "offline"
      ? "offline"
      : status === "error"
        ? "error"
        : needsSync
          ? "pending"
          : isLinked
            ? "active"
            : "unlinked";

  const iconClass = cn(
    "transition-all duration-300",
    collapsed ? "h-[18px] w-[18px]" : "h-3 w-3",
  );
  const fillProp = collapsed ? { fill: "currentColor", strokeWidth: 0 } : {};

  const configMap = {
    syncing: {
      label: "Syncing...",
      icon: <RefreshCw className={cn(iconClass, "text-blue-500 animate-spin")} />,
      border: "border-blue-500/50",
      desktopBg: "bg-blue-500/10 hover:bg-blue-500/20",
      mobileBg: "bg-blue-500/10",
      tooltip: "Syncing your changes to the cloud...",
    },
    offline: {
      label: "Offline",
      icon: <CloudOff className={cn(iconClass, "text-muted-foreground")} />,
      border: "border-muted-foreground/30",
      desktopBg: "bg-sidebar-accent/5 hover:bg-sidebar-accent/10",
      mobileBg: "bg-muted/50",
      tooltip: "Offline mode. Changes are saved locally.",
    },
    error: {
      label: "Sync Error",
      icon: collapsed 
        ? <SolidAlertCircle className={cn(iconClass, "text-destructive")} />
        : <AlertCircle className={cn(iconClass, "text-destructive")} />,
      border: "border-destructive/50",
      desktopBg: "bg-destructive/10 hover:bg-destructive/20",
      mobileBg: "bg-destructive/10",
      tooltip: errorMessage || "Sync failed. Please try again.",
    },
    pending: {
      label: "Pending Sync",
      icon: (
        <Cloud
          className={cn(
            iconClass,
            isSyncOverdue ? "text-destructive animate-pulse" : "text-amber-500",
          )}
          {...fillProp}
        />
      ),
      border: isSyncOverdue ? "border-destructive/50" : "border-amber-500/50",
      desktopBg: isSyncOverdue
        ? "bg-destructive/10 hover:bg-destructive/20"
        : "bg-amber-500/10 hover:bg-amber-500/20",
      mobileBg: isSyncOverdue ? "bg-destructive/10" : "bg-amber-500/10",
      tooltip: `${pendingCount} local change${pendingCount > 1 ? "s" : ""} pending sync since ${lastSync ? formatDistanceToNow(new Date(lastSync)) + " ago" : "a while"}.`,
    },
    active: {
      label: "Cloud Active",
      icon: <Cloud className={cn(iconClass, "text-emerald-500")} {...fillProp} />,
      border: "border-emerald-500/50",
      desktopBg: "bg-sidebar-accent/5 hover:bg-sidebar-accent/10",
      mobileBg: "bg-muted/50",
      tooltip: "Your data is securely backed up to the DumosRx cloud.",
    },
    impersonating: {
      label: "Sync Disabled",
      icon: <CloudOff className={cn(iconClass, "text-muted-foreground")} />,
      border: "border-muted-foreground/30",
      desktopBg: "bg-sidebar-accent/5",
      mobileBg: "bg-muted/50",
      tooltip: "Sync is disabled during an impersonated session. Support access is read-only; nothing is pushed to or pulled from this store's cloud data.",
    },
    unlinked: {
      label: "Not Linked",
      icon: <CloudOff className={cn(iconClass, "text-muted-foreground")} />,
      border: "border-muted-foreground/30",
      desktopBg: "bg-sidebar-accent/5 hover:bg-sidebar-accent/10",
      mobileBg: "bg-muted/50",
      tooltip: "Connect your cloud account to enable backups.",
    },
  } as const;

  const currentConfig = configMap[stateKey];
  const statusLabel = currentConfig.label;
  const statusIcon = currentConfig.icon;
  // Collapsed shows the bare icon; border and background fade in with the
  // sidebar's own expand transition.
  const statusBorder = collapsed ? "border-transparent" : currentConfig.border;
  const desktopBg = collapsed ? "hover:bg-sidebar-accent" : currentConfig.desktopBg;
  const mobileBg = currentConfig.mobileBg;
  const tooltipText = currentConfig.tooltip;

  if (isMobileHeader) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          title={isImpersonating ? tooltipText : undefined}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border max-w-fit transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:w-3.5 [&_svg]:h-3.5",
            mobileBg, statusBorder,
            isImpersonating ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
          onClick={() => void handleManualSync()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void handleManualSync();
            }
          }}
        >
          {statusIcon}
          <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap">
            {statusLabel}
          </span>
        </div>
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </>
    );
  }

  // One persistent shape revealed by max-width/height transitions, never
  // two trees swapped by a conditional (client/AGENTS.md).
  return (
    <div className="px-2 pb-1">
      <div
        id="tour-sync-indicator"
        role="button"
        tabIndex={0}
        className={cn(
          "border rounded-xl transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isImpersonating ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          collapsed ? "p-2" : "p-2.5",
          statusBorder,
          desktopBg,
        )}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleManualSync();
          }
        }}
        onClick={() => {
          // Never gate this on `status`: navigator.onLine misreports after
          // mobile wake, and sync() already handles being offline.
          void handleManualSync();
        }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex flex-col transition-all duration-300",
                  collapsed ? "gap-0" : "gap-1.5",
                )}
              >
                <div
                  className={cn(
                    "flex items-center transition-all duration-300",
                    collapsed ? "justify-center" : "justify-between",
                  )}
                >
                  <div className="flex items-center min-w-0">
                    {statusIcon}
                    <span
                      className={cn(
                        "text-[11px] font-bold text-sidebar-foreground uppercase tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300",
                        collapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[100px] opacity-100 ml-2",
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-300 shrink-0",
                          collapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[28px] opacity-100 ml-2",
                        )}
                      >
                        <button
                          type="button"
                          data-testid="sync-now-button"
                          onClick={(e) => {
                            // The card's own onClick would otherwise fire a
                            // second, mutex-colliding sync.
                            e.stopPropagation();
                            handleManualSync();
                          }}
                          disabled={isImpersonating || isSyncInProgress}
                          aria-label="Sync now"
                          className="p-1 border border-sidebar-border rounded-md transition-colors disabled:opacity-30 cursor-pointer hover:bg-sidebar-accent relative z-10"
                        >
                          <RefreshCw
                            className={cn(
                              "h-3 w-3 text-sidebar-foreground !flex",
                              isSyncInProgress && "animate-spin",
                            )}
                          />
                        </button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="font-semibold text-xs mb-1 bg-card border-accent/10">
                      {isImpersonating ? "Sync disabled while impersonating" : "Sync Now"}
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 pl-5",
                    collapsed ? "max-h-0 opacity-0" : "max-h-5 opacity-100",
                  )}
                >
                  <p className="text-[10px] text-sidebar-foreground/70 font-medium whitespace-nowrap">
                    Last synced {!!(lastSync) && formatDistanceToNow(new Date(lastSync)).replace('about ', '').replace('less than a minute', '1 min') + " ago"}
                    {!(lastSync) && "never"}
                  </p>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-card border-accent/10 max-w-[180px]">
              <div className="space-y-1">
                <p className="text-xs font-bold">Cloud Sync Engine</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{tooltipText}</p>
                {collapsed && lastSync && (
                  <p className="text-[10px] text-muted-foreground">
                    Last sync: {formatDistanceToNow(new Date(lastSync))} ago
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}

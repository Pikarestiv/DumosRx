"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSyncQueueCount } from "@/lib/db/queries/setup";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

import { sync, isSyncing as checkIsSyncing } from "@/lib/db/sync-engine";
import { addSyncQueueChangeListener } from "@/lib/db/core";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { AuthModal } from "./auth-modal";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

// Bursts of local writes (e.g. checking out a multi-item sale, a bulk
// stock receive) should collapse into one sync call, not one per row —
// same reasoning as core.ts's transaction-scoped invalidation batching.
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
  // One source of truth for "is this an impersonated session" (see
  // lib/utils/impersonation.ts); sync() enforces the same rule internally,
  // this only makes the refusal visible instead of silent.
  const { isImpersonating } = useAuth();

  const { data: pendingCountData } = useQuery({
    ...queryKeys.sync.queueCount(),
    queryFn: () => getSyncQueueCount(),
    refetchInterval: 5000 // Refetch every 5 seconds for indicator
  });
  const pendingCount = pendingCountData || 0;

  const isSyncOverdue = lastSync
    ? Date.now() - new Date(lastSync).getTime() > 30 * 60 * 1000
    : false;

  const needsSync = pendingCount > 0 && isSyncOverdue;

  useEffect(() => {
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener("auth_token_set", updateOnlineStatus);
    window.addEventListener("auth_token_cleared", updateOnlineStatus);

    const interval = setInterval(() => {
      const stored = localStorage.getItem("last_sync_time");
      if (stored) setLastSync(stored);
      setIsSyncInProgress(checkIsSyncing());
    }, 2000);

    const stored = localStorage.getItem("last_sync_time");
    if (stored) setLastSync(stored);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener("auth_token_set", updateOnlineStatus);
      window.removeEventListener("auth_token_cleared", updateOnlineStatus);
      clearInterval(interval);
    };
  }, []);

  const updateOnlineStatus = () => {
    setStatus(navigator.onLine ? "online" : "offline");
    const token = localStorage.getItem("auth_token");
    setIsLinked(!!token);
  };

  const handleManualSync = useCallback(async () => {
    // Impersonation is read-only support access: sync is disabled for the
    // whole session (sync() itself refuses too). Toasting rather than
    // silently returning so a superadmin isn't left wondering why the
    // indicator looks frozen.
    if (isImpersonating) {
      toast.info("Sync is disabled during an impersonated session.");
      return;
    }
    if (isSyncInProgress) return;
    setIsSyncInProgress(true);
    setStatus("syncing");
    try {
      const result = await sync(true);
      if (result.success) {
        setStatus("online");
        setLastSync(new Date().toISOString());
        setErrorMessage(null);
        toast.success("Sync completed successfully");
      } else {
        setStatus("error");
        const errorMsg = typeof result.error === 'string' ? result.error : "Sync failed";
        setErrorMessage(errorMsg);
        if (errorMsg.includes("Unauthenticated") || errorMsg.includes("401")) {
          setShowAuthModal(true);
        }
      }
    } catch (err) {
      console.error("Manual sync failed:", err);
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
  }, [isSyncInProgress, isImpersonating]);

  // Background Auto-Sync Daemon. Two modes, switched purely by
  // auto_sync_interval's value: 0 means "sync instantly after any local
  // change" (event-driven, via core.ts's sync-queue-change listeners),
  // any positive number means poll every N minutes like before. Both
  // branches are torn down and rebuilt whenever auto_sync_interval changes
  // (it's a dependency below), so switching a store between the two modes
  // at runtime — e.g. an admin retunes a plan tier, or the store's own
  // tier changes — cleanly stops whichever mode was active.
  useEffect(() => {
    let autoSyncIntervalTimer: NodeJS.Timeout | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;

    // No daemon at all while impersonating: neither the interval timer nor
    // the sync-queue-change listener is even installed, so an impersonated
    // session never so much as attempts a background push/pull.
    if (storeProfile?.auto_sync_enabled === 1 && isLinked && !isImpersonating) {
      const intervalMinutes = storeProfile?.auto_sync_interval ?? 15;

      if (intervalMinutes === 0) {
        unsubscribe = addSyncQueueChangeListener(() => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            if (navigator.onLine && !checkIsSyncing()) {
              console.log("Auto-sync triggered (instant, on change)");
              void handleManualSync();
            }
          }, INSTANT_SYNC_DEBOUNCE_MS);
        });
      } else {
        const intervalMs = intervalMinutes * 60 * 1000;
        autoSyncIntervalTimer = setInterval(() => {
          if (navigator.onLine && !checkIsSyncing()) {
            console.log(`Auto-sync triggered (${intervalMinutes} min interval)`);
            void handleManualSync();
          }
        }, intervalMs);
      }
    }

    return () => {
      if (autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe?.();
    };
  }, [storeProfile?.auto_sync_enabled, storeProfile?.auto_sync_interval, isLinked, isImpersonating, handleManualSync]);

  // Wins over every other state: while impersonating there is nothing the
  // indicator could usefully report about syncing, because no sync will run.
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
      icon: <Cloud className={cn(iconClass, "text-amber-500 animate-pulse")} {...fillProp} />,
      border: "border-amber-500/50",
      desktopBg: "bg-amber-500/10 hover:bg-amber-500/20",
      mobileBg: "bg-amber-500/10",
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
  // Collapsed shows no status border/background at all — just the bare
  // icon, like every other sidebar nav icon at rest. The colored border and
  // background fade in together as part of the same transition once the
  // sidebar actually starts expanding, rather than sitting there as a
  // permanent box around the icon in the collapsed rail.
  const statusBorder = collapsed ? "border-transparent" : currentConfig.border;
  const desktopBg = collapsed ? "hover:bg-sidebar-accent" : currentConfig.desktopBg;
  const mobileBg = currentConfig.mobileBg;
  const tooltipText = currentConfig.tooltip;

  if (isMobileHeader) {
    return (
      <>
        <div
          title={isImpersonating ? tooltipText : undefined}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border max-w-fit transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5",
            mobileBg, statusBorder,
            isImpersonating ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
          onClick={() => void handleManualSync()}
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

  // A single persistent shape that grows, not two structurally different
  // layouts swapped by a conditional — matching every other collapsible bit
  // of sidebar content (nav labels, the logo wordmark), which fade/reveal
  // inside markup that's always there rather than mounting a differently
  // shaped tree. The label, the refresh button, and the "last synced" line
  // each reveal via max-width/max-height + opacity transitions on the same
  // 300ms timeline as the sidebar's own width transition (dashboard-
  // sidebar.tsx's `transition-all duration-300`), so they grow in lockstep
  // with the panel instead of popping in once it's already done widening.
  return (
    <div className="px-2 pb-1">
      <div
        id="tour-sync-indicator"
        className={cn(
          "border rounded-xl transition-all duration-300",
          isImpersonating ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          collapsed ? "p-2" : "p-2.5",
          statusBorder,
          desktopBg,
        )}
        onClick={() => {
          // While impersonating, handleManualSync is a no-op that toasts the
          // reason — still worth calling, hence the first branch.
          if (isImpersonating || status !== "offline") void handleManualSync();
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
                            // The whole card (#tour-sync-indicator) has its
                            // own onClick calling handleManualSync too, so
                            // without this a click on the button itself fires
                            // it twice - the second call hits sync()'s mutex,
                            // toasts a spurious "already in progress" error,
                            // and its finally{} clears isSyncInProgress while
                            // the first call is still running.
                            e.stopPropagation();
                            handleManualSync();
                          }}
                          disabled={isImpersonating || isSyncInProgress || status === "offline"}
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

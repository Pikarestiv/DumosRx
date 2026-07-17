"use client";

import { useEffect, useState } from "react";
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
import { useStore } from "@/lib/context/store-context";
import { AuthModal } from "./auth-modal";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

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

  const { data: pendingCountData } = useQuery({
    queryKey: ['syncQueueCount'],
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

  // Background Auto-Sync Daemon
  useEffect(() => {
    let autoSyncIntervalTimer: NodeJS.Timeout | null = null;

    if (storeProfile?.auto_sync_enabled === 1 && isLinked) {
      const intervalMinutes = storeProfile?.auto_sync_interval || 15;
      const intervalMs = intervalMinutes * 60 * 1000;

      autoSyncIntervalTimer = setInterval(() => {
        if (navigator.onLine && !checkIsSyncing()) {
          console.log(`Auto-sync triggered (${intervalMinutes} min interval)`);
          handleManualSync();
        }
      }, intervalMs);
    }

    return () => {
      if (autoSyncIntervalTimer) clearInterval(autoSyncIntervalTimer);
    };
  }, [storeProfile?.auto_sync_enabled, storeProfile?.auto_sync_interval, isLinked]);

  const updateOnlineStatus = () => {
    setStatus(navigator.onLine ? "online" : "offline");
    const token = localStorage.getItem("auth_token");
    setIsLinked(!!token);
  };

  const handleManualSync = async () => {
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
    } catch (err: any) {
      console.error("Manual sync failed:", err);
      setStatus("error");
      setErrorMessage(err.message?.includes("Unauthenticated")
        ? "Cloud Account Unauthenticated. Please re-link in settings."
        : "Sync failed. Check your connection.");

      if (err.message?.includes("Unauthenticated") || err.message?.includes("401")) {
        setShowAuthModal(true);
      }
    } finally {
      setIsSyncInProgress(false);
    }
  };

  const statusLabel = isSyncInProgress
    ? "Syncing..."
    : status === "offline"
      ? "Offline"
      : status === "error"
        ? "Sync Error"
        : needsSync
          ? "Pending Sync"
          : isLinked
            ? "Cloud Active"
            : "Not Linked";

  const statusIcon = isSyncInProgress ? (
    <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
  ) : status === "offline" ? (
    <CloudOff className="h-3 w-3 text-muted-foreground" />
  ) : status === "error" ? (
    <AlertCircle className="h-3 w-3 text-destructive" />
  ) : needsSync ? (
    <Cloud className="h-3 w-3 text-amber-500 animate-pulse" />
  ) : (
    <Cloud className="h-3 w-3 text-emerald-500" />
  );

  const statusBorder = isSyncInProgress
    ? "border-blue-500/50"
    : status === "offline"
      ? "border-muted-foreground/30"
      : status === "error"
        ? "border-destructive/50"
        : needsSync
          ? "border-amber-500/50"
          : "border-emerald-500/50";


  const tooltipText = isSyncInProgress
    ? "Syncing your changes to the cloud..."
    : status === "offline"
      ? "Offline mode. Changes are saved locally."
      : status === "error"
        ? errorMessage || "Sync failed. Please try again."
        : needsSync
          ? `${pendingCount} local change${pendingCount > 1 ? "s" : ""} pending sync since ${lastSync ? formatDistanceToNow(new Date(lastSync)) + " ago" : "a while"}.`
          : isLinked
            ? "Your data is securely backed up to the DumosRx cloud."
            : "Connect your cloud account to enable backups.";

  if (isMobileHeader) {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/50 border ${statusBorder} max-w-fit transition-colors`} onClick={handleManualSync}>
        {statusIcon}
        <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
          {statusLabel}
        </span>
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    );
  }

  if (collapsed) {
    return (
      <div id="tour-sync-indicator" className="px-2 py-3 flex flex-col items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleManualSync}
                disabled={isSyncInProgress || status === "offline"}
                className="p-2 rounded-lg transition-colors disabled:opacity-30 cursor-pointer hover:bg-sidebar-accent border border-transparent hover:border-sidebar-border"
                title={statusLabel}
              >
                {statusIcon}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-card border-accent/10 max-w-[180px]">
              <div className="space-y-1">
                <p className="text-xs font-bold">{statusLabel}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{tooltipText}</p>
                {lastSync && (
                  <p className="text-[10px] text-muted-foreground">
                    Last sync: {formatDistanceToNow(new Date(lastSync))} ago
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    );
  }

  return (
    <div className="px-2 pb-1">
      <div id="tour-sync-indicator" className={`p-2.5 border rounded-xl ${statusBorder} bg-sidebar-accent/5 transition-colors`}>
        <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon}
                  <span className="text-[11px] font-bold text-sidebar-foreground uppercase tracking-tight">
                    {statusLabel}
                  </span>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleManualSync}
                      disabled={isSyncInProgress || status === "offline"}
                      className="p-1 border border-sidebar-border rounded-md transition-colors disabled:opacity-30 cursor-pointer hover:bg-sidebar-accent relative z-10"
                    >
                      <RefreshCw
                        className={cn(
                          "h-3 w-3 text-sidebar-foreground !flex",
                          isSyncInProgress && "animate-spin",
                        )}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="font-semibold text-xs mb-1 bg-card border-accent/10">
                    Sync Now
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex justify-between items-center pl-5">
                <p className="text-[10px] text-sidebar-foreground/70 font-medium">
                  Last synced {lastSync
                    ? formatDistanceToNow(new Date(lastSync)).replace('about ', '').replace('less than a minute', '1 min') + " ago"
                    : "never"}
                </p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-card border-accent/10">
            <div className="space-y-1">
              <p className="text-xs font-bold">Cloud Sync Engine</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {tooltipText}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </div>
    </div>
  );
}

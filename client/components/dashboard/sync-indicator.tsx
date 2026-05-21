"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
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

export function SyncIndicator() {
  const [status, setStatus] = useState<
    "online" | "offline" | "syncing" | "error"
  >("online");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isSyncInProgress, setIsSyncInProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const { storeProfile } = useStore();

  useEffect(() => {
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

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
      const result = await sync();
      if (result.success) {
        setStatus("online");
        setLastSync(new Date().toISOString());
        setErrorMessage(null);
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

  return (
    <div className="px-4 py-4 border-t border-sidebar-border bg-sidebar-accent/5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isSyncInProgress ? (
                    <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                  ) : status === "offline" ? (
                    <CloudOff className="h-4 w-4 text-muted-foreground" />
                  ) : status === "error" ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Cloud className="h-4 w-4 text-emerald-500" />
                  )}
                  <span className="text-xs font-bold text-sidebar-foreground uppercase tracking-tight">
                    {isSyncInProgress
                      ? "Syncing..."
                      : status === "offline"
                        ? "Offline"
                        : status === "error"
                          ? "Sync Error"
                          : isLinked
                            ? "Cloud Active"
                            : "Not Linked"}
                  </span>
                </div>

                <button
                  onClick={handleManualSync}
                  disabled={isSyncInProgress || status === "offline"}
                  className="p-1.5 bg-sidebar-accent rounded-lg transition-colors disabled:opacity-30 cursor-pointer border border-transparent hover:border-sidebar-border"
                  title="Sync Now"
                >
                  <RefreshCw
                    className={cn(
                      "h-3 w-3 text-sidebar-foreground/60 !flex",
                      isSyncInProgress && "animate-spin",
                    )}
                  />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-[10px] text-sidebar-foreground/50 font-medium">
                  LAST BACKUP
                </p>
                <p className="text-[10px] text-sidebar-foreground/80 font-bold">
                  {lastSync
                    ? formatDistanceToNow(new Date(lastSync)) + " ago"
                    : "Never"}
                </p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-card border-accent/10">
            <div className="space-y-1">
              <p className="text-xs font-bold">Cloud Sync Engine</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {isSyncInProgress
                  ? "Syncing your changes to the cloud..."
                  : status === "offline"
                    ? "Offline mode. Changes are saved locally."
                    : status === "error"
                      ? errorMessage || "Sync failed. Please try again."
                      : isLinked
                        ? "Your data is securely backed up to the DumosRx cloud."
                        : "Connect your cloud account to enable automatic backups and sync."}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}

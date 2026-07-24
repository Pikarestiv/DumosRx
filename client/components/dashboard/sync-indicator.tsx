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

  const stateKey = isSyncInProgress
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

  const iconClass = collapsed ? "h-[18px] w-[18px]" : "h-3 w-3";
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
    unlinked: {
      label: "Not Linked",
      icon: <Cloud className={cn(iconClass, "text-emerald-500")} {...fillProp} />,
      border: "border-emerald-500/50",
      desktopBg: "bg-sidebar-accent/5 hover:bg-sidebar-accent/10",
      mobileBg: "bg-muted/50",
      tooltip: "Connect your cloud account to enable backups.",
    },
  } as const;

  const currentConfig = configMap[stateKey];
  const statusLabel = currentConfig.label;
  const statusIcon = currentConfig.icon;
  const statusBorder = currentConfig.border;
  const desktopBg = currentConfig.desktopBg;
  const mobileBg = currentConfig.mobileBg;
  const tooltipText = currentConfig.tooltip;

  if (isMobileHeader) {
    return (
      <>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${mobileBg} border ${statusBorder} max-w-fit transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5 cursor-pointer`} onClick={handleManualSync}>
          {statusIcon}
          <span className="text-[12px] font-medium text-muted-foreground whitespace-nowrap">
            {statusLabel}
          </span>
        </div>
        <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
      </>
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
      <div 
        id="tour-sync-indicator" 
        className={`p-2.5 border rounded-xl ${statusBorder} ${desktopBg} transition-colors cursor-pointer`}
        onClick={handleManualSync}
      >
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
                      disabled={isSyncInProgress || status === "offline"}
                      className="p-1 border border-sidebar-border rounded-md transition-colors disabled:opacity-30 cursor-pointer hover:bg-sidebar-accent relative z-10 pointer-events-none"
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
                  Last synced {!!(lastSync) && formatDistanceToNow(new Date(lastSync)).replace('about ', '').replace('less than a minute', '1 min') + " ago"}
                                  {!(lastSync) && "never"}
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
      </div>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </div>
  );
}

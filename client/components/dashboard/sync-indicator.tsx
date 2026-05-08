"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertCircle, ArrowRight, ShieldAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

import { sync, isSyncing as checkIsSyncing } from "@/lib/db/sync-engine";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  const router = useRouter();

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
                  className="p-1.5 hover:bg-sidebar-accent rounded-lg transition-colors disabled:opacity-30 cursor-pointer border border-transparent hover:border-sidebar-border"
                  title="Sync Now"
                >
                  <RefreshCw
                    className={cn(
                      "h-3 w-3 text-sidebar-foreground/60",
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

      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden border border-white/5 bg-card shadow-2xl rounded-2xl">
          <div className="p-8">
            <DialogHeader className="space-y-4">
              <div className="mx-auto w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center mb-1 border border-destructive/10">
                <CloudOff className="h-7 w-7 text-destructive" />
              </div>
              <div className="text-center">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  Connection Expired
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-relaxed">
                  Your cloud session has timed out. 
                  Synchronization is <span className="text-destructive font-medium">paused</span> until you re-link.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="mt-6 space-y-6">
              <div className="bg-muted/30 rounded-lg p-4 border border-white/5">
                <p className="text-xs text-muted-foreground leading-relaxed text-center">
                  For your security, cloud sessions expire periodically. 
                  Relinking restores your automatic backups and cross-device sync.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  className="h-11 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20"
                  onClick={() => {
                    setShowAuthModal(false);
                    router.push("/settings?tab=cloud");
                  }}
                >
                  Re-link Cloud Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  className="h-11 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAuthModal(false)}
                >
                  Dismiss for now
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

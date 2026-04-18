"use client";

import { useEffect, useState } from "react";
import { 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sync } from "@/lib/db/sync-engine";

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<"online" | "offline" | "syncing" | "error">("online");
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    // Initial check
    updateOnlineStatus();

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Heartbeat sync every 5 minutes if online
    const interval = setInterval(() => {
      if (navigator.onLine) {
        handleAutoSync();
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      clearInterval(interval);
    };
  }, []);

  const updateOnlineStatus = () => {
    setStatus(navigator.onLine ? "online" : "offline");
  };

  const handleAutoSync = async () => {
    setStatus("syncing");
    try {
      const result = await sync();
      if (result.success) {
        setStatus("online");
        setLastSynced(new Date().toLocaleTimeString());
      } else {
        setStatus("error");
      }
    } catch (err) {
      setStatus("error");
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-help">
            {status === "online" && (
              <Badge variant="outline" className="h-6 gap-1 bg-emerald-500/5 text-emerald-500 border-emerald-500/20 px-2">
                <Cloud className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-tight">Connected</span>
              </Badge>
            )}
            {status === "offline" && (
              <Badge variant="outline" className="h-6 gap-1 bg-muted text-muted-foreground border-accent/10 px-2">
                <CloudOff className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-tight">Offline</span>
              </Badge>
            )}
            {status === "syncing" && (
              <Badge variant="outline" className="h-6 gap-1 bg-blue-500/5 text-blue-500 border-blue-500/20 px-2">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-tight">Syncing</span>
              </Badge>
            )}
            {status === "error" && (
              <Badge variant="outline" className="h-6 gap-1 bg-destructive/5 text-destructive border-destructive/20 px-2">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-tight">Sync Error</span>
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-card border-accent/10">
          <div className="space-y-1">
            <p className="text-xs font-bold">Cloud Sync Status</p>
            <p className="text-[10px] text-muted-foreground">
              {status === "offline" 
                ? "Working in local-first mode. Changes will sync when online."
                : `Last backup: ${lastSynced || 'Just now'}`}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

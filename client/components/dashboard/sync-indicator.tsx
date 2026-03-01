"use client";

import React, { useEffect, useState } from "react";
import { Cloud, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { formatDistanceToNow } from "date-fns";
import { sync } from "@/lib/db/sync-engine";

export function SyncIndicator() {
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Get pending count from sync_queue
  const { data: queueData, refetch } = useLocalData<{ count: number }>(
    "SELECT COUNT(*) as count FROM _sync_queue"
  );

  const pendingCount = queueData[0]?.count || 0;

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await sync();
      refetch();
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Polling for updates
    const interval = setInterval(() => {
      refetch();
      const stored = localStorage.getItem("last_sync_time");
      if (stored) setLastSync(stored);
    }, 5000);

    const stored = localStorage.getItem("last_sync_time");
    if (stored) setLastSync(stored);

    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <div className="px-4 py-4 border-t border-sidebar-border bg-sidebar-accent/5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isSyncing ? (
            <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
          ) : pendingCount === 0 ? (
            <Cloud className="h-4 w-4 text-green-500" />
          ) : (
            <RefreshCw className="h-4 w-4 text-amber-500" />
          )}
          <span className="text-xs font-medium text-sidebar-foreground">
            {isSyncing ? "Syncing..." : pendingCount === 0 ? "Synced" : `${pendingCount} pending`}
          </span>
        </div>
        <button 
          onClick={handleManualSync}
          disabled={isSyncing}
          className="p-1 hover:bg-sidebar-accent rounded-md transition-colors disabled:opacity-50 cursor-pointer"
          title="Sync Now"
        >
          <RefreshCw className={cn("h-3 w-3 text-sidebar-foreground/60", isSyncing && "animate-spin")} />
        </button>
      </div>
      
      <p className="text-[10px] text-sidebar-foreground/60">
        Last sync: {lastSync ? formatDistanceToNow(new Date(lastSync)) + " ago" : "Never"}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { query } from "@/lib/db/local-database";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { formatDistanceToNow } from "date-fns";

export function SyncIndicator() {
  const [lastSync, setLastSync] = useState<string | null>(null);
  
  // Get pending count from sync_queue
  const { data: queueData, refetch } = useLocalData<{ count: number }>(
    "SELECT COUNT(*) as count FROM _sync_queue"
  );

  const pendingCount = queueData[0]?.count || 0;

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
          {pendingCount === 0 ? (
            <Cloud className="h-4 w-4 text-green-500" />
          ) : (
            <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />
          )}
          <span className="text-xs font-medium text-sidebar-foreground">
            {pendingCount === 0 ? "Synced" : `${pendingCount} pending`}
          </span>
        </div>
        <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
      </div>
      
      <p className="text-[10px] text-sidebar-foreground/60">
        Last sync: {lastSync ? formatDistanceToNow(new Date(lastSync)) + " ago" : "Never"}
      </p>
    </div>
  );
}

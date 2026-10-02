"use client";

import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStaffDevices } from "@/lib/api/admin-hooks";

interface StaffDeviceHistoryProps {
  userId: string;
}

/** Drill-down for a staff member's full sync history - every device they've
 * ever synced from, most recent first. The staff list itself only shows the
 * single most recent one; this is for the rarer "which of their devices is
 * actually stale" debugging question. Fetched lazily, only once opened. */
export function StaffDeviceHistory({ userId }: StaffDeviceHistoryProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useStaffDevices(userId, open);
  const devices = data?.devices ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-600 cursor-pointer"
        >
          <History className="h-3 w-3" />
          Sync history
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
          Devices synced from
        </p>
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          </div>
        )}
        {!isLoading && devices.length === 0 && (
          <p className="text-xs text-slate-400">Never synced from any device.</p>
        )}
        {!isLoading && devices.length > 0 && (
          <ul className="space-y-2">
            {devices.map((device) => (
              <li key={device.deviceId} className="text-xs">
                <p className="font-bold text-slate-900 dark:text-slate-100">
                  {device.deviceLabel}
                </p>
                <p className="text-slate-400">{device.lastSyncedAt ?? "Unknown time"}</p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

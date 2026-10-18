"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStoreQueueState } from "@/lib/api/admin-hooks-sync";
import { syncReasonLabel } from "@/lib/api/admin-hooks-sync";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { StuckItemActions } from "./stuck-item-actions";
import type { DeviceQueueReport, StoreQueueState } from "@/lib/types/admin-platform";

function waitedFor(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;

  return `${Math.round(seconds / 86400)}d`;
}

/**
 * Eventual delivery per edit. A per-attempt success rate reads the same
 * whether a device delivers in seconds or has been sitting on an edit for a
 * day. Null means a bundle that reports neither, never "delivered instantly".
 */
function DeliveryTiming({ device }: { device: DeviceQueueReport }) {
  const ages = device.delivered_ages;

  const oldest = device.oldest_queued_seconds ?? null;

  if (oldest === null && !ages) {
    return null;
  }

  return (
    <div className="px-3 py-2 text-xs text-muted-foreground border-b border-slate-100 dark:border-slate-800">
      {oldest !== null && (
        <p>
          <span className="font-semibold text-foreground/70">Oldest unsynced edit</span>{" "}
          {`waited ${waitedFor(oldest)} so far`}
        </p>
      )}
      {ages && (
        <p>
          <span className="font-semibold text-foreground/70">Delivered since last report</span>{" "}
          {`under 1m ${ages.under_1m}, under 5m ${ages.under_5m}, under 1h ${ages.under_1h},`}
          {` under 1d ${ages.under_1d}, over 1d ${ages.over_1d}`}
        </p>
      )}
    </div>
  );
}

export function StoreQueueStatePanel({ storeId }: { storeId: string }) {
  const { data, isLoading, isError } = useStoreQueueState(storeId);

  return (
    <StoreQueueStateSection data={data} isLoading={isLoading} isError={isError} storeId={storeId} />
  );
}

interface StoreQueueStateSectionProps {
  data?: StoreQueueState;
  isLoading: boolean;
  isError?: boolean;
  /** Absent in isolated rendering; actions are simply not offered then. */
  storeId?: string;
}

export function StoreQueueStateSection({
  data,
  isLoading,
  isError,
  storeId,
}: StoreQueueStateSectionProps) {
  if (isError) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        Device queue state unavailable for this store
      </p>
    );
  }

  if (isLoading && !data) {
    return <p className="text-sm text-muted-foreground">Checking device queues…</p>;
  }

  // Silence is not health: a device that has never reported has not been
  // measured, and this view would otherwise read as "nothing is stuck".
  if (!data?.measured) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        No device has reported its queue yet, so nothing can be said about what is stuck.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {data.devices_with_stuck_items === 0 ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-sm font-bold text-foreground">
              No reporting device has anything stuck.
            </p>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-amber-500">
              {data.devices_with_stuck_items} of {data.devices.length} devices have stuck rows.
            </p>
          </>
        )}
      </div>

      {data.devices.map((device) => (
        <div
          key={device.device_id}
          className="rounded-md border border-slate-200 dark:border-slate-800"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">
                {device.device_label ?? "Unnamed device"}
              </p>
              <p className="font-mono text-xs text-muted-foreground break-all">
                {device.device_id}
              </p>
            </div>
            <div className="text-right shrink-0">
              <Badge variant={device.stuck_count > 0 ? "destructive" : "secondary"}>
                {`${device.stuck_count} stuck of ${device.queue_depth} queued`}
              </Badge>
              {device.reported_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateSafe(device.reported_at, "dd/MM/yyyy HH:mm", "")}
                </p>
              )}
            </div>
          </div>

          <DeliveryTiming device={device} />

          {device.stuck_items.length > 0 && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {device.stuck_items.map((item) => (
                <li
                  key={`${item.table_name}:${item.record_id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">{item.table_name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground break-all">
                      {item.record_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {syncReasonLabel(item.reason) ?? item.reason}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {`${item.attempts} attempts`}
                      </p>
                    </div>
                    {storeId && (
                      <StuckItemActions
                        storeId={storeId}
                        deviceId={device.device_id}
                        item={item}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {device.truncated && (
            <p className="text-xs text-muted-foreground px-3 py-2">
              {`Showing the first ${device.stuck_items.length} of ${device.stuck_count}.`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

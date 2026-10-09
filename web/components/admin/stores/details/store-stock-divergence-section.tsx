"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStoreStockDivergence } from "@/lib/api/admin-hooks-sync";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { StoreStockDivergence } from "@/lib/types/admin-platform";
import { DeviceReportAction } from "./device-report-action";

export function StoreStockDivergencePanel({ storeId }: { storeId: string }) {
  const { data, isLoading, isError } = useStoreStockDivergence(storeId);

  return (
    <StoreStockDivergenceSection
      data={data}
      isLoading={isLoading}
      isError={isError}
      storeId={storeId}
    />
  );
}

interface StoreStockDivergenceSectionProps {
  data?: StoreStockDivergence;
  isLoading: boolean;
  isError?: boolean;
  /** Omitted renders the list read-only, with no per-device controls. */
  storeId?: string;
}

export function StoreStockDivergenceSection({
  data,
  isLoading,
  isError,
  storeId,
}: StoreStockDivergenceSectionProps) {
  if (isError) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        Stock divergence unavailable for this store
      </p>
    );
  }

  if (isLoading && !data) {
    return <p className="text-sm text-muted-foreground">Checking device stock…</p>;
  }

  // Never "no divergence": a store nobody has reported for has not been
  // measured, and claiming agreement would be a claim nobody has earned.
  if (!data?.measured) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        No device has reported its stock yet, so agreement is unknown.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {data.diverged_devices === 0 ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-sm font-bold text-foreground">
              Every reporting device agrees with the cloud.
            </p>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-amber-500">
              {data.diverged_devices} of {data.devices.length} devices disagree with the cloud.
            </p>
          </>
        )}
      </div>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800">
        {data.devices.map((device) => (
          <li key={device.device_id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="font-mono text-xs text-foreground break-all">{device.device_id}</p>
              <p className="text-xs text-muted-foreground">
                {`Device ${device.device_quantity_sum} across ${device.device_batch_count} batches · cloud ${device.server_quantity_sum} across ${device.server_batch_count}`}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {storeId && (
                <DeviceReportAction storeId={storeId} deviceId={device.device_id} />
              )}
              <div className="text-right">
              {device.diverged ? (
                <Badge variant="destructive">
                  {device.quantity_delta > 0 ? "+" : ""}
                  {device.quantity_delta}
                </Badge>
              ) : (
                <Badge variant="secondary">Agrees</Badge>
              )}
              {device.reported_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateToDDMMYYYY(device.reported_at)}
                </p>
              )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

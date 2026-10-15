"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStoreStockDivergence } from "@/lib/api/admin-hooks-sync";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { formatMoney } from "@/lib/utils/currency";
import type { StoreStockDivergence } from "@/lib/types/admin-platform";
import { DeviceReportAction } from "./device-report-action";
import { DeviceRowActions } from "./device-row-actions";

/** Figures run to five digits on a real store, so they are unreadable raw. */
function formatCount(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

export function StoreStockDivergencePanel({
  storeId,
  currency,
}: {
  storeId: string;
  currency?: string | null;
}) {
  const { data, isLoading, isError } = useStoreStockDivergence(storeId);

  return (
    <StoreStockDivergenceSection
      data={data}
      isLoading={isLoading}
      isError={isError}
      storeId={storeId}
      currency={currency}
    />
  );
}

interface StoreStockDivergenceSectionProps {
  data?: StoreStockDivergence;
  isLoading: boolean;
  isError?: boolean;
  /** Omitted renders the list read-only, with no per-device controls. */
  storeId?: string;
  currency?: string | null;
}

export function StoreStockDivergenceSection({
  data,
  isLoading,
  isError,
  storeId,
  currency,
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

      <p className="text-xs text-muted-foreground">
        Each row is a snapshot taken when that device last reported, not a live comparison, so
        two devices that reported on different days are measured against different cloud totals.
        Stock is valued at cost and includes discontinued products&apos; remaining batches, so these
        cloud figures can exceed the Total Stock Value above, which excludes them.
      </p>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
        {data.devices.map((device) => (
          <li
            key={device.device_id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {device.device_label ?? "Unnamed device"}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {device.device_id}
                </p>
              </div>

              <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <dt className="font-semibold text-foreground/70">Device</dt>
                <dd>
                  {`${formatCount(device.device_quantity_sum)} across ${formatCount(device.device_batch_count)} batches`}
                  {device.device_value_sum == null
                    ? " · value not reported"
                    : ` · ${formatMoney(Math.round(device.device_value_sum), currency)}`}
                </dd>
                <dt className="font-semibold text-foreground/70">Cloud</dt>
                <dd>
                  {`${formatCount(device.server_quantity_sum)} across ${formatCount(device.server_batch_count)} batches`}
                  {device.server_value_sum == null
                    ? ""
                    : ` · ${formatMoney(Math.round(device.server_value_sum), currency)}`}
                </dd>
              </dl>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <div className="flex items-center gap-2">
                {!device.diverged && !!device.value_delta && (
                  <span className="text-xs font-medium text-amber-500">Costs differ</span>
                )}
                {device.diverged ? (
                  <Badge variant="destructive">
                    {device.quantity_delta > 0 ? "+" : ""}
                    {formatCount(device.quantity_delta)}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Agrees</Badge>
                )}
              </div>

              {device.reported_at && (
                <p className="text-xs text-muted-foreground">
                  {formatDateSafe(device.reported_at, "dd/MM/yyyy HH:mm", "")}
                </p>
              )}

              {storeId && (
                <div className="flex items-center gap-1">
                  <DeviceReportAction storeId={storeId} deviceId={device.device_id} />
                  <DeviceRowActions
                    storeId={storeId}
                    deviceId={device.device_id}
                    deviceLabel={device.device_label}
                    deviceNickname={device.device_nickname}
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

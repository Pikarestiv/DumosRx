"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStoreStockDivergence } from "@/lib/api/admin-hooks-sync";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { formatMoney } from "@/lib/utils/currency";
import type { DeviceStockReport, StoreStockDivergence } from "@/lib/types/admin-platform";
import {
  COLUMN_LABEL,
  DeviceIdentity,
  FIGURE_CELL,
  signedCount,
} from "./store-detail-primitives";
import { DeviceReportAction } from "./device-report-action";
import { DeviceRowActions } from "./device-row-actions";

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

function money(value: number | null | undefined, currency?: string | null): string | null {
  return value == null ? null : formatMoney(Math.round(value), currency);
}

function signedMoney(value: number, currency?: string | null): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";

  return `${sign}${formatMoney(Math.round(Math.abs(value)), currency)}`;
}

function FigureRow({
  label,
  units,
  batches,
  value,
  missing,
  emphasis,
}: {
  label: string;
  units: string;
  batches: string;
  value: string | null;
  missing: string;
  emphasis?: boolean;
}) {
  const tone = emphasis
    ? "font-bold text-rose-600 dark:text-rose-400"
    : "text-slate-900 dark:text-slate-100";

  return (
    <tr>
      <th
        scope="row"
        className="w-[3.25rem] py-0.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </th>
      <td className={`${FIGURE_CELL} py-0.5 ${tone}`}>{units}</td>
      <td className={`${FIGURE_CELL} py-0.5 ${tone}`}>{batches}</td>
      <td className={`${FIGURE_CELL} py-0.5 ${value === null ? "text-muted-foreground" : tone}`}>
        {value ?? missing}
      </td>
    </tr>
  );
}

function StockComparison({
  device,
  currency,
}: {
  device: DeviceStockReport;
  currency?: string | null;
}) {
  const comparable = device.has_local_copy !== false && !device.stale;

  return (
    <table className="w-full table-fixed text-[11px]">
      <caption className="sr-only">
        What this device reported against what the cloud held, frozen at its last report
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Side</span>
          </th>
          <th scope="col" className={`${COLUMN_LABEL} ${FIGURE_CELL} pb-0.5`}>
            Units
          </th>
          <th scope="col" className={`${COLUMN_LABEL} ${FIGURE_CELL} pb-0.5`}>
            Batches
          </th>
          <th scope="col" className={`${COLUMN_LABEL} ${FIGURE_CELL} pb-0.5`}>
            Value
          </th>
        </tr>
      </thead>
      <tbody>
        <FigureRow
          label="Device"
          units={Number(device.device_quantity_sum ?? 0).toLocaleString()}
          batches={Number(device.device_batch_count ?? 0).toLocaleString()}
          value={money(device.device_value_sum, currency)}
          missing="Not reported"
        />
        <FigureRow
          label="Cloud"
          units={Number(device.server_quantity_sum ?? 0).toLocaleString()}
          batches={Number(device.server_batch_count ?? 0).toLocaleString()}
          value={money(device.server_value_sum, currency)}
          missing="Not reported"
        />
        {comparable && (
          <FigureRow
            label="Diff"
            units={signedCount(device.quantity_delta ?? 0)}
            batches={signedCount(device.batch_delta ?? 0)}
            value={
              device.value_delta == null ? null : signedMoney(device.value_delta, currency)
            }
            missing="—"
            emphasis={device.diverged || !!device.value_delta}
          />
        )}
      </tbody>
    </table>
  );
}

function DeviceStatus({ device }: { device: DeviceStockReport }) {
  if (device.has_local_copy === false) {
    return <Badge variant="outline">No local copy of this store</Badge>;
  }

  if (device.stale) {
    return <Badge variant="outline">Stopped reporting</Badge>;
  }

  return (
    <>
      {!device.diverged && !!device.value_delta && (
        <span className="text-xs font-medium text-amber-500">Costs differ</span>
      )}
      {device.diverged ? (
        <Badge variant="destructive">Disagrees</Badge>
      ) : (
        <Badge variant="secondary">Agrees</Badge>
      )}
    </>
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

  if (!data?.measured) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        No device has reported its stock yet, so agreement is unknown.
      </p>
    );
  }

  const comparable = data.devices.filter((d) => d.has_local_copy !== false && !d.stale);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {comparable.length === 0 ? (
          <>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-bold text-muted-foreground">
              No device currently holds a comparable copy of this store.
            </p>
          </>
        ) : data.diverged_devices === 0 ? (
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
              {data.diverged_devices} of {comparable.length} devices disagree with the cloud.
            </p>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Every figure below is frozen at the moment that device reported, not a live reading, so two
        devices that reported on different days are measured against different cloud totals. Stock
        is valued at cost and includes discontinued products&apos; remaining batches, so these cloud
        figures can exceed the Total Stock Value above, which excludes them.
      </p>

      <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
        {data.devices.map((device) => (
          <li key={device.device_id} className="space-y-2 px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1 basis-[10rem]">
                <DeviceIdentity
                  label={device.device_nickname ?? device.device_label}
                  deviceId={device.device_id}
                />
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <DeviceStatus device={device} />
                </div>
                {device.reported_at && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatDateSafe(device.reported_at, "dd/MM/yyyy HH:mm", "")}
                  </p>
                )}
                {storeId && (
                  <div className="flex items-center gap-1">
                    <DeviceReportAction
                      storeId={storeId}
                      deviceId={device.device_id}
                      deviceLabel={device.device_nickname ?? device.device_label}
                    />
                    <DeviceRowActions
                      storeId={storeId}
                      deviceId={device.device_id}
                      deviceLabel={device.device_label}
                      deviceNickname={device.device_nickname}
                    />
                  </div>
                )}
              </div>
            </div>

            <StockComparison device={device} currency={currency} />
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStoreTableAgreement } from "@/lib/api/admin-hooks-sync";
import { formatDateSafe } from "@/lib/utils/date-utils";
import type { DeviceTableReport, StoreTableAgreement } from "@/lib/types/admin-platform";

export function StoreTableAgreementPanel({ storeId }: { storeId: string }) {
  const { data, isLoading, isError } = useStoreTableAgreement(storeId);

  return <StoreTableAgreementSection data={data} isLoading={isLoading} isError={isError} />;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function DeviceHeading({ device }: { device: DeviceTableReport }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-bold text-foreground">
        {device.device_nickname ?? device.device_label ?? "Unnamed device"}
      </p>
      <p className="truncate font-mono text-xs text-muted-foreground">{device.device_id}</p>
    </div>
  );
}

function DeviceVerdict({ device }: { device: DeviceTableReport }) {
  if (device.has_local_copy === false) {
    return <Badge variant="outline">No local copy of this store</Badge>;
  }

  if (device.stale) {
    return <Badge variant="outline">Stopped reporting</Badge>;
  }

  if (device.diverged_tables.length > 0) {
    return (
      <Badge variant="destructive">
        {`${device.diverged_tables.length} table${device.diverged_tables.length === 1 ? "" : "s"} disagree`}
      </Badge>
    );
  }

  // "Every table agrees" above a listed catching-up table is a contradiction
  // the operator notices, and then stops trusting the panel.
  const unsettled = device.tables.filter((row) => row.verdict !== "agrees").length;

  return unsettled > 0 ? (
    <Badge variant="outline">{`Catching up on ${unsettled}`}</Badge>
  ) : (
    <Badge variant="secondary">Every table agrees</Badge>
  );
}

function DisagreeingTables({ device }: { device: DeviceTableReport }) {
  const rows = device.tables.filter((row) => row.verdict !== "agrees");

  if (rows.length === 0 || device.has_local_copy === false || device.stale) {
    return null;
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((row) => (
        <li key={row.table} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">{row.table}</p>
            <p className="text-[11px] text-muted-foreground">
              {`device ${row.device_rows.toLocaleString()} rows · cloud ${row.server_rows.toLocaleString()} rows`}
              {row.device_pending > 0 ? ` · ${row.device_pending} queued` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {row.verdict === "syncing" ? (
              <Badge variant="outline">Still syncing</Badge>
            ) : row.verdict === "behind" ? (
              <Badge variant="outline">Catching up</Badge>
            ) : (
              <Badge variant="destructive">
                {row.row_delta !== 0 ? `${signed(row.row_delta)} rows` : "same rows, other edits"}
              </Badge>
            )}
            {row.verdict === "diverged" && row.row_delta === 0 && row.version_delta !== 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {`version sum ${signed(row.version_delta)}`}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

interface StoreTableAgreementSectionProps {
  data?: StoreTableAgreement;
  isLoading: boolean;
  isError?: boolean;
}

export function StoreTableAgreementSection({
  data,
  isLoading,
  isError,
}: StoreTableAgreementSectionProps) {
  if (isError) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        Table agreement unavailable for this store
      </p>
    );
  }

  if (isLoading && !data) {
    return <p className="text-sm text-muted-foreground">Checking device tables…</p>;
  }

  // Never "every table agrees": a device on a bundle that predates this
  // report has not been measured, and claiming agreement for it would be a
  // claim nobody has earned.
  if (!data?.measured) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        No device has reported its tables yet, so agreement is unknown.
      </p>
    );
  }

  const comparable = data.devices.filter((d) => d.has_local_copy !== false && !d.stale);
  const catchingUp = comparable.filter(
    (d) => d.diverged_tables.length === 0 && d.tables.some((row) => row.verdict !== "agrees"),
  ).length;

  return (
    <div className="space-y-4">
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
              {catchingUp === 0
                ? "Every reporting device holds the same rows as the cloud."
                : `No device disagrees with the cloud; ${catchingUp} is still catching up.`}
            </p>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-amber-500">
              {data.diverged_devices} of {comparable.length} devices disagree on at least one table.
            </p>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Each row freezes both sides at the moment that device reported, so two devices measured on
        different days are compared against different cloud totals. A table is compared by its row
        count and the sum of its row versions, which catches a missing row or a row left at the
        wrong version, but not two offsetting edits inside one table.
      </p>

      {data.devices.map((device) => (
        <div
          key={device.device_id}
          className="rounded-md border border-slate-200 dark:border-slate-800"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <DeviceHeading device={device} />
            <div className="shrink-0 text-right">
              <DeviceVerdict device={device} />
              {device.reported_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateSafe(device.reported_at, "dd/MM/yyyy HH:mm", "")}
                </p>
              )}
            </div>
          </div>

          <DisagreeingTables device={device} />
        </div>
      ))}
    </div>
  );
}

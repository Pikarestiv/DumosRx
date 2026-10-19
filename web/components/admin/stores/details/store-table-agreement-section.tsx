"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useStoreTableAgreement } from "@/lib/api/admin-hooks-sync";
import { catchingUpPhrase } from "@/lib/admin/sync-verdict";
import { formatDateSafe } from "@/lib/utils/date-utils";
import {
  COLUMN_LABEL,
  DeviceIdentity,
  FIGURE_CELL,
  signedCount,
} from "./store-detail-primitives";
import type {
  DeviceTableAgreementRow,
  DeviceTableReport,
  StoreTableAgreement,
} from "@/lib/types/admin-platform";

export function StoreTableAgreementPanel({ storeId }: { storeId: string }) {
  const { data, isLoading, isError } = useStoreTableAgreement(storeId);

  return <StoreTableAgreementSection data={data} isLoading={isLoading} isError={isError} />;
}

const NUM_COL = "w-[3.25rem] px-1 sm:w-[4.5rem] sm:px-2";
const STATUS_COL = "w-[5.5rem] px-3 sm:w-[8.5rem]";

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

  const unsettled = device.tables.filter((row) => row.verdict !== "agrees").length;

  return unsettled > 0 ? (
    <Badge variant="outline">{`Catching up on ${unsettled}`}</Badge>
  ) : (
    <Badge variant="secondary">Every table agrees</Badge>
  );
}

function statusLabel(row: DeviceTableAgreementRow): string {
  if (row.verdict === "syncing") return "Still syncing";
  if (row.verdict === "behind") return "Catching up";

  return row.row_delta !== 0 ? "Disagrees" : "Same rows, other edits";
}

function TableRow({ row }: { row: DeviceTableAgreementRow }) {
  const diverged = row.verdict === "diverged";
  const alarm = "font-bold text-rose-600 dark:text-rose-400";

  return (
    <tr>
      <th scope="row" className="px-3 py-1.5 text-left align-top">
        <span className="block truncate text-xs font-bold text-foreground" title={row.table}>
          {row.table}
        </span>
      </th>
      <td className={`${NUM_COL} ${FIGURE_CELL} py-1.5 align-top text-foreground`}>
        {row.device_rows.toLocaleString()}
      </td>
      <td className={`${NUM_COL} ${FIGURE_CELL} py-1.5 align-top text-foreground`}>
        {row.server_rows.toLocaleString()}
      </td>
      <td
        className={`${NUM_COL} ${FIGURE_CELL} py-1.5 align-top ${
          diverged ? alarm : "text-muted-foreground"
        }`}
      >
        {signedCount(row.row_delta)}
      </td>
      <td className={`${STATUS_COL} py-1.5 align-top text-right`}>
        <span className={diverged ? alarm : "font-medium text-muted-foreground"}>
          {statusLabel(row)}
        </span>
        {diverged && row.row_delta === 0 && row.version_delta !== 0 && (
          <span className="block tabular-nums text-muted-foreground">
            {`version sum ${signedCount(row.version_delta)}`}
          </span>
        )}
        {row.device_pending > 0 && (
          <span className="block tabular-nums text-muted-foreground">
            {`${row.device_pending.toLocaleString()} queued`}
          </span>
        )}
      </td>
    </tr>
  );
}

function DisagreeingTables({ device }: { device: DeviceTableReport }) {
  const rows = device.tables.filter((row) => row.verdict !== "agrees");

  if (rows.length === 0 || device.has_local_copy === false || device.stale) {
    return null;
  }

  return (
    <table className="w-full table-fixed text-[11px]">
      <caption className="sr-only">
        Tables this device does not yet hold in agreement with the cloud, as of its last report
      </caption>
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800">
          <th scope="col" className={`${COLUMN_LABEL} px-3 pb-1 pt-2 text-left`}>
            Table
          </th>
          <th scope="col" className={`${COLUMN_LABEL} ${NUM_COL} pb-1 pt-2 text-right`}>
            Device
          </th>
          <th scope="col" className={`${COLUMN_LABEL} ${NUM_COL} pb-1 pt-2 text-right`}>
            Cloud
          </th>
          <th scope="col" className={`${COLUMN_LABEL} ${NUM_COL} pb-1 pt-2 text-right`}>
            Diff
          </th>
          <th scope="col" className={`${COLUMN_LABEL} ${STATUS_COL} pb-1 pt-2 text-right`}>
            Status
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => (
          <TableRow key={row.table} row={row} />
        ))}
      </tbody>
    </table>
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
              {catchingUp === 0
                ? "Every reporting device holds the same rows as the cloud."
                : `No device disagrees with the cloud; ${catchingUpPhrase(catchingUp)}.`}
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
        Every figure below is frozen at the moment that device reported, not a live reading, so two
        devices measured on different days are compared against different cloud totals. A table is
        compared by its row count and the sum of its row versions, which catches a missing row or a
        row left at the wrong version, but not two offsetting edits inside one table.
      </p>

      <div className="space-y-2">
        {data.devices.map((device) => (
          <div
            key={device.device_id}
            className="rounded-xl border border-slate-200 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2">
              <DeviceIdentity
                label={device.device_nickname ?? device.device_label}
                deviceId={device.device_id}
              />
              <div className="flex shrink-0 flex-col items-end gap-1">
                <DeviceVerdict device={device} />
                {device.reported_at && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatDateSafe(device.reported_at, "dd/MM/yyyy HH:mm", "")}
                  </p>
                )}
              </div>
            </div>

            <DisagreeingTables device={device} />
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { collectDeviceDiagnostics } from "@/lib/db/queries/diagnostics";
import type { DeviceDiagnostics } from "@/lib/db/queries/diagnostics";
import { useStore } from "@/lib/context/store-context";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { APP_VERSION, BUILD_SHA } from "@/lib/constants";
import { getLastSyncTime } from "@/lib/storage-keys";

const CARD =
  "bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value}</span>
    </div>
  );
}

function hoursSince(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "unknown";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function buildReport(
  data: DeviceDiagnostics,
  identity: Record<string, string>,
): string {
  const lines: string[] = ["DumosRx device report", ""];

  for (const [key, value] of Object.entries(identity)) {
    lines.push(`${key}: ${value}`);
  }

  lines.push("", `Sync queue: ${data.queueTotal} item(s), ${data.conflicts} conflict(s)`);
  for (const row of data.queue) {
    lines.push(
      `  ${row.table_name}: ${row.pending} pending, ${row.retrying} retrying` +
        (row.last_error ? ` — last error: ${row.last_error}` : ""),
    );
  }

  lines.push("", "Sync state");
  for (const row of data.syncState) {
    lines.push(
      `  ${row.table_name}: last synced ${row.last_synced_at ?? "never"}` +
        (row.server_cursor ? " (mid-window)" : ""),
    );
  }

  lines.push(
    "",
    `Stock integrity: ${data.integrity.checked} batch(es) checked, ` +
      `${data.integrity.diverged} diverged, ${data.integrity.unreconstructable} unreconstructable, ` +
      `net ${data.integrity.netUnitDelta >= 0 ? "+" : ""}${data.integrity.netUnitDelta} units`,
    `Unapplied stock deltas: ${data.pendingDeltas.length}`,
    "",
    `Products: ${data.resolution.products}`,
    `  category that cannot be resolved on this device: ${data.resolution.unresolvableCategory}`,
    `  without any active batch: ${data.resolution.productsWithoutBatches}`,
    `  batches holding stock with no movement behind them: ${data.resolution.batchesWithoutMovements}`,
  );

  return lines.join("\n");
}

export function DeviceDiagnosticsPanel() {
  const { storeProfile } = useStore();
  const [copied, setCopied] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["device-diagnostics"],
    queryFn: collectDeviceDiagnostics,
    staleTime: 0,
  });

  const identity = useMemo(
    () => ({
      Device: `${getDeviceLabel()} (${getDeviceId()})`,
      Build: `${APP_VERSION} · ${BUILD_SHA}`,
      Store: `${storeProfile?.name ?? "unknown"} (${storeProfile?.id ?? "unknown"})`,
      "Last sync": getLastSyncTime() ?? "never",
      Online: typeof navigator !== "undefined" && navigator.onLine ? "yes" : "no",
    }),
    [storeProfile],
  );

  const copyReport = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildReport(data, identity));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }, [data, identity]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-prose">
          What this device believes about its own sync. Everything here is read
          from the local database and nothing is changed by opening this page.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => void copyReport()} disabled={!data}>
            <Copy className="h-4 w-4 mr-2" />
            {copied ? "Copied" : "Copy report"}
          </Button>
        </div>
      </div>

      <Card className={CARD}>
        <CardHeader>
          <CardTitle className="text-base">This device</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
          {Object.entries(identity).map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader>
          <CardTitle className="text-base">
            Waiting to reach the cloud
            {data ? ` (${data.queueTotal})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
          {data?.queue.length === 0 && (
            <p className="py-1.5 text-sm text-muted-foreground">
              Nothing queued. Everything this device has changed is on the server.
            </p>
          )}
          {data?.queue.map((row) => (
            <Row
              key={row.table_name}
              label={row.table_name}
              value={
                <>
                  {row.pending} pending
                  {row.retrying > 0 && `, ${row.retrying} retrying`}
                  {row.last_error && (
                    <span className="block text-xs text-destructive font-normal">
                      {row.last_error}
                    </span>
                  )}
                </>
              }
            />
          ))}
          {data && data.conflicts > 0 && (
            <Row label="Unresolved conflicts" value={data.conflicts} />
          )}
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader>
          <CardTitle className="text-base">How far each table has synced</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
          {data?.syncState.map((row) => (
            <Row
              key={row.table_name}
              label={row.table_name}
              value={
                <>
                  {hoursSince(row.last_synced_at)}
                  {row.server_cursor && (
                    <span className="block text-xs text-muted-foreground font-normal">
                      stopped partway through a page
                    </span>
                  )}
                </>
              }
            />
          ))}
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader>
          <CardTitle className="text-base">Stock the log cannot explain</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
          {data && (
            <>
              <Row label="Batches checked" value={data.integrity.checked} />
              <Row
                label="Disagree with their own history"
                value={
                  <>
                    {data.integrity.diverged}
                    {data.integrity.diverged > 0 && (
                      <span className="block text-xs text-muted-foreground font-normal">
                        net {data.integrity.netUnitDelta >= 0 ? "+" : ""}
                        {data.integrity.netUnitDelta} units
                      </span>
                    )}
                  </>
                }
              />
              <Row
                label="Hold stock with no movement behind them"
                value={data.integrity.unreconstructable}
              />
              <Row label="Stock updates not yet applied" value={data.pendingDeltas.length} />
            </>
          )}
        </CardContent>
      </Card>

      <Card className={CARD}>
        <CardHeader>
          <CardTitle className="text-base">Catalogue</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 dark:divide-slate-800">
          {data && (
            <>
              <Row label="Products" value={data.resolution.products} />
              <Row
                label="Category this device cannot resolve"
                value={data.resolution.unresolvableCategory}
              />
              <Row label="No active batch" value={data.resolution.productsWithoutBatches} />
              <Row
                label="Batches with stock but no movements"
                value={data.resolution.batchesWithoutMovements}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, RefreshCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { foldStockQuantities } from "@/lib/db/sync-engine/stock-integrity";
import { collectDeviceDiagnostics } from "@/lib/db/queries/diagnostics";
import type { DeviceDiagnostics } from "@/lib/db/queries/diagnostics";
import { useStore } from "@/lib/context/store-context";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { APP_VERSION, BUILD_SHA } from "@/lib/constants";
import { getLastSyncTime } from "@/lib/storage-keys";
import { buildReport } from "./diagnostics/diagnostics-report";
import { DiagnosticsDetailCards } from "./diagnostics/diagnostics-detail-cards";
import { isTauri } from "@/lib/db/core";

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

export function DeviceDiagnosticsPanel() {
  const { storeProfile } = useStore();
  const [copied, setCopied] = useState(false);
  const [showFoldConfirm, setShowFoldConfirm] = useState(false);

  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
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
      Platform: `${isTauri() ? "desktop" : "web"} · ${
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown"
      }`,
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
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => void copyReport()} disabled={!data}>
            <Copy className="h-4 w-4 mr-2" />
            {copied ? "Copied" : "Copy report"}
          </Button>
          </div>
          {/* Every query here is local SQLite and finishes in milliseconds, so
              the spinner never visibly spins and identical numbers look like a
              dead button. The timestamp is the proof it read. */}
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Read at {new Date(dataUpdatedAt).toLocaleTimeString("en-GB")}
            </span>
          )}
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
          {data && data.crashTelemetryQueued > 0 && (
            <Row
              label="of which crash reports"
              value={`${data.crashTelemetryQueued} (the dashboard count excludes these)`}
            />
          )}
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
              <Row
                label="Waiting on a delta, not yet comparable"
                value={data.integrity.pending}
              />
              <Row label="Stock updates not yet applied" value={data.deltas.total} />
              {data.deltas.chronic > 0 && (
                <Row
                  label="of those, stuck 10+ rounds"
                  value={data.deltas.chronic}
                />
              )}
              {data.deltas.productMissing > 0 && (
                <Row
                  label="whose product is gone locally"
                  value={`${data.deltas.productMissing} — a resync will not clear these`}
                />
              )}
            </>
          )}
          {data && data.integrity.diverged > 0 && (
            <div className="pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowFoldConfirm(true)}>
                <Wrench className="h-4 w-4 mr-2" />
                Rebuild {data.integrity.diverged} batch
                {data.integrity.diverged === 1 ? "" : "es"} from history
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {data && <DiagnosticsDetailCards data={data} />}

      <ConfirmDialog
        open={showFoldConfirm}
        onOpenChange={setShowFoldConfirm}
        title="Rebuild stock from movement history"
        description={
          data
            ? `Sets ${data.integrity.diverged} batch(es) back to the sum of their own stock movements, on this device only. Nothing is sent to the cloud, and the ${data.integrity.unreconstructable} batch(es) with no movement behind them are left untouched.`
            : ""
        }
        confirmLabel="Rebuild"
        onConfirm={async () => {
          try {
            const result = await foldStockQuantities();
            toast.success(
              `Rebuilt ${result.folded} batch(es), correcting ${result.unitsCorrected} unit(s).` +
                (result.refused > 0 ? ` ${result.refused} left untouched.` : ""),
            );
            await refetch();
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Could not rebuild stock.",
            );
          }
          setShowFoldConfirm(false);
        }}
      />

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

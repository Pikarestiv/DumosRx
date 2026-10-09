"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeviceDiagnostics } from "@/lib/db/queries/diagnostics";

const CARD =
  "bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm";

const DIVIDE = "divide-y divide-slate-100 dark:divide-slate-800";

function ago(iso: string | null): string {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "unknown";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function duration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Shown only when it has something to say, so a healthy till stays short and
 * anything rendered here is by definition worth reading. */
export function DiagnosticsDetailCards({ data }: { data: DeviceDiagnostics }) {
  const clockAhead = data.clock.watermarkAheadMs;

  return (
    <>
      {clockAhead !== null && clockAhead > 60_000 && (
        <Card className={`${CARD} border-destructive/50`}>
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Clock watermark is ahead of this device
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              The last recorded activity is{" "}
              <strong>{duration(clockAhead)} ahead</strong> of this device&apos;s
              clock, so every licence check reads as a rollback.
            </p>
            <p className="text-muted-foreground text-xs">
              This is the shape that locks a till out entirely. Correct the date
              and time, then clear the lock from the licence screen.
            </p>
          </CardContent>
        </Card>
      )}

      {data.missingTables.length > 0 && (
        <Card className={`${CARD} border-destructive/50`}>
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Tables missing from this device
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm break-all">
            {data.missingTables.join(", ")}
          </CardContent>
        </Card>
      )}

      {data.stuckRows.length > 0 && (
        <Card className={CARD}>
          <CardHeader>
            <CardTitle className="text-base">
              Stuck changes ({data.stuckRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className={DIVIDE}>
            <p className="pb-2 text-xs text-muted-foreground">
              Five or more failed attempts. The store id shown is the one inside
              the frozen payload — if it is not this store, that is the bug.
            </p>
            {data.stuckRows.slice(0, 15).map((row) => (
              <div key={`${row.table_name}-${row.record_id}`} className="py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">
                    {row.table_name} · {row.operation}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {row.retry_count} attempts · {ago(row.created_at)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground break-all">
                  {row.record_id} · {row.reason}
                  {row.payload_store_id && ` · payload store ${row.payload_store_id}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.orphans.length > 0 && (
        <Card className={CARD}>
          <CardHeader>
            <CardTitle className="text-base">
              Unsynced with nothing queued
            </CardTitle>
          </CardHeader>
          <CardContent className={DIVIDE}>
            <p className="pb-2 text-xs text-muted-foreground">
              Rows this device will re-queue on its next restart. A number that
              never falls is the shape behind repeated &quot;changes could not be
              saved&quot; loops.
            </p>
            {data.orphans.map((row) => (
              <div
                key={row.table_name}
                className="flex items-center justify-between py-1.5 text-sm"
              >
                <span className="text-muted-foreground">{row.table_name}</span>
                <span className="font-medium">{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.crashes.length > 0 && (
        <Card className={CARD}>
          <CardHeader>
            <CardTitle className="text-base">
              Crashes recorded on this device
            </CardTitle>
          </CardHeader>
          <CardContent className={DIVIDE}>
            <p className="pb-2 text-xs text-muted-foreground">
              Newest first. Trigger the fault, then press Refresh — a count that
              climbs is the bug firing.
            </p>
            {data.crashes.map((crash, index) => (
              <div key={`${crash.area}-${index}`} className="py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{crash.area}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ×{crash.occurrence_count} · {ago(crash.last_occurred_at)}
                    {!crash.synced && " · unsent"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground break-words">
                  {crash.message}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

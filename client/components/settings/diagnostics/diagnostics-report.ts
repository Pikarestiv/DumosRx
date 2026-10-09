import type { DeviceDiagnostics } from "@/lib/db/queries/diagnostics";

/**
 * The pasteable support ticket. Privacy is the governing constraint, not
 * completeness: a sync `last_error`'s first 300 chars can be a driver error
 * quoting a whole row, so this file emits reason CLASSES, never raw errors,
 * and never the licence token or an audit row's free-form details.
 */
const LOOKS_LIKE_SQL = /SQLSTATE|INSERT |UPDATE |SELECT |constraint/i;

function duration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function buildReport(
  data: DeviceDiagnostics,
  identity: Record<string, string>,
): string {
  const lines: string[] = ["DumosRx device report", ""];

  for (const [key, value] of Object.entries(identity)) {
    lines.push(`${key}: ${value}`);
  }

  if (data.clock.watermarkAheadMs !== null && data.clock.watermarkAheadMs > 0) {
    lines.push(
      `CLOCK: watermark is ${duration(data.clock.watermarkAheadMs)} AHEAD of this device — licence lockout shape`,
    );
  }
  if (data.clock.status && data.clock.status !== "active") {
    lines.push(`Store status: ${data.clock.status}${data.clock.suspensionReason ? ` (${data.clock.suspensionReason})` : ""}`);
  }
  if (data.missingTables.length > 0) {
    lines.push(`MISSING TABLES: ${data.missingTables.join(", ")}`);
  }

  lines.push(
    "",
    `Sync queue: ${data.queueTotal} item(s)` +
      (data.crashTelemetryQueued > 0
        ? `, of which ${data.crashTelemetryQueued} are crash reports`
        : "") +
      `, ${data.conflicts} unresolved conflict(s)`,
  );
  for (const row of data.queue) {
    lines.push(`  ${row.table_name}: ${row.pending} pending, ${row.retrying} retrying`);
  }

  if (data.stuckRows.length > 0) {
    const mismatched = data.stuckRows.filter(
      (row) => row.payload_store_id && row.payload_store_id !== data.clock.watermark,
    );
    lines.push(
      "",
      `Stuck rows (5+ attempts): ${data.stuckRows.length}`,
      ...(mismatched.length > 0
        ? [`  ${mismatched.length} carry a store_id in their payload — check it matches this store`]
        : []),
    );
    for (const row of data.stuckRows.slice(0, 20)) {
      lines.push(
        `  ${row.table_name}/${row.operation} ${row.record_id} · ${row.retry_count} attempts · ${row.reason}` +
          (row.payload_store_id ? ` · payload store ${row.payload_store_id}` : ""),
      );
    }
  }

  if (data.orphans.length > 0) {
    lines.push("", "Unsynced with no queue entry (re-queued every boot)");
    for (const row of data.orphans) {
      lines.push(`  ${row.table_name}: ${row.count}`);
    }
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
    `Stock integrity: ${data.integrity.checked} checked, ${data.integrity.diverged} diverged, ` +
      `${data.integrity.pending} awaiting a delta, ${data.integrity.unreconstructable} unreconstructable, ` +
      `net ${data.integrity.netUnitDelta >= 0 ? "+" : ""}${data.integrity.netUnitDelta} units`,
  );
  for (const batch of [...data.integrity.divergedBatches]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 10)) {
    lines.push(
      `  batch ${batch.batchId}: stored ${batch.batchQuantity} vs log ${batch.movementQuantity} (${batch.delta >= 0 ? "+" : ""}${batch.delta})`,
    );
  }

  lines.push(
    "",
    `Unapplied stock deltas: ${data.deltas.total}` +
      (data.deltas.chronic > 0 ? `, ${data.deltas.chronic} chronic (10+ attempts)` : "") +
      (data.deltas.productMissing > 0
        ? `, ${data.deltas.productMissing} whose product is gone locally (a resync will NOT clear these)`
        : ""),
  );

  if (data.crashes.length > 0) {
    lines.push("", "Recent crashes on this device");
    for (const crash of data.crashes.slice(0, 10)) {
      // The message is withheld when it looks like SQL: a driver error can
      // quote a whole row, including a password hash or a customer's details.
      const safe = LOOKS_LIKE_SQL.test(crash.message)
        ? "(database error, see the screen)"
        : crash.message;
      lines.push(
        `  ${crash.area} · ${safe} · x${crash.occurrence_count} · last ${crash.last_occurred_at ?? "unknown"}` +
          (crash.synced ? "" : " · NOT yet synced"),
      );
    }
  }

  lines.push(
    "",
    `Products: ${data.resolution.products}`,
    `  category that cannot be resolved on this device: ${data.resolution.unresolvableCategory}`,
    `  without any active batch: ${data.resolution.productsWithoutBatches}`,
  );

  return lines.join("\n");
}

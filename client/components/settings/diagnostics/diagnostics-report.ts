import type { DeviceDiagnostics } from "@/lib/db/queries/diagnostics";
import { peekDeliveredAges } from "@/lib/db/sync-engine/delivery-age";

/**
 * The pasteable support ticket. Privacy is the governing constraint, not
 * completeness: a sync `last_error`'s first 300 chars can be a driver error
 * quoting a whole row, so this file emits reason CLASSES, never raw errors,
 * and never the licence token or an audit row's free-form details.
 */
const LOOKS_LIKE_SQL = /SQLSTATE|INSERT |UPDATE |SELECT |constraint/i;

/** Matches `/support`'s own `max` on `message` — see laravel-server/AGENTS.md,
 * "Remote device report". */
export const MAX_REPORT_CHARS = 60_000;

function fitToTicket(report: string): string {
  if (report.length <= MAX_REPORT_CHARS) {
    return report;
  }

  const marker = (omitted: number) => `\n[truncated: ${omitted} characters omitted]`;
  const kept = MAX_REPORT_CHARS - marker(report.length).length;

  return `${report.slice(0, kept)}${marker(report.length - kept)}`;
}

function duration(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Eventual delivery per edit, which a per-attempt success rate cannot show:
 * a device whose pushes all "succeed" can still be sitting on a day-old
 * edit. Two lines, because the ticket has a 60,000-character cap.
 */
function deliveryLines(data: DeviceDiagnostics): string[] {
  const lines: string[] = [];
  const oldest = data.queue
    .map((row) => (row.oldest === null ? NaN : Date.parse(row.oldest)))
    .filter((stamp) => Number.isFinite(stamp));

  if (oldest.length > 0) {
    lines.push(`  Oldest unsynced edit: ${duration(Date.now() - Math.min(...oldest))} old`);
  }

  const ages = peekDeliveredAges();

  if (ages) {
    lines.push(
      `  Delivered since last report: <1m ${ages.under_1m}, <5m ${ages.under_5m},` +
        ` <1h ${ages.under_1h}, <1d ${ages.under_1d}, 1d+ ${ages.over_1d}`,
    );
  }

  return lines;
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
  lines.push(...deliveryLines(data));

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

  if (data.lastSyncOutcome) {
    const outcome = data.lastSyncOutcome;
    lines.push(
      "",
      `Last sync ATTEMPT: ${outcome.at} — ${
        outcome.success
          ? `ok (pushed ${outcome.pushed}, pulled ${outcome.pulled})`
          : `FAILED: ${outcome.reason ?? "unknown"}`
      }`,
    );
  }

  if (data.conflictGroups.length > 0) {
    lines.push("", "Changes the server refused outright");
    for (const group of data.conflictGroups) {
      lines.push(
        `  ${group.table_name} · ${group.reason} · ${group.count} · latest ${group.latest ?? "unknown"}`,
      );
    }
  }

  if (data.batchConflicts.length > 0) {
    lines.push(
      "",
      "Batch edits the server refused (resolved ones included on purpose — A-268)",
    );
    for (const row of data.batchConflicts) {
      lines.push(
        `  ${row.record_id} · ${row.reason} · fields ${row.fields ?? "unknown"} · ${row.detected_at}` +
          (row.resolved_at ? ` · marked resolved ${row.resolved_at}` : " · still unresolved"),
      );
    }
  }

  if (data.batchCosts.length > 0) {
    const shielded = data.batchCosts.filter((row) => row.shielded);
    lines.push(
      "",
      `Batch costs on this device (${shielded.length} the pull cannot reach, of ${data.batchCosts.length} listed)`,
      "  Compare against: SELECT id, cost_price, _version, updated_at FROM stock_batches WHERE id IN (...)",
    );
    for (const row of data.batchCosts) {
      lines.push(
        `  ${row.shielded ? "SHIELDED " : ""}${row.id} · cost ${row.cost_price ?? "null"} · qty ${row.quantity}` +
          ` · v${row._version ?? "?"} · ${row.updated_at ?? "unknown"}`,
      );
    }
  }

  lines.push("", "Sync state");
  for (const row of data.syncState) {
    lines.push(
      `  ${row.table_name}: last synced ${row.last_synced_at ?? "never"}` +
        (row.server_cursor ? " (mid-window)" : "") +
        ((row.rewind_count ?? 0) > 0
          ? ` · ${row.rewind_count} rewind(s), baseline ${row.rewound_from ?? "unknown"}`
          : ""),
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

  return fitToTicket(lines.join("\n"));
}

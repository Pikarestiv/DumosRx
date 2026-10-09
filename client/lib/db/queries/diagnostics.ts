import { query, getActiveStoreId } from "@/lib/db/core";
import {
  stuckQueueRows,
  orphanedUnsyncedRows,
  recentCrashes,
  clockState,
  deltaHealth,
  missingTables,
  crashTelemetryQueued,
  type StuckRow,
  type OrphanCount,
  type CrashRow,
  type ClockState,
  type DeltaHealth,
} from "./diagnostics-detail";
import { verifyStockIntegrity } from "@/lib/db/sync-engine/stock-integrity";
import type { StockIntegrityReport } from "@/lib/db/sync-engine/stock-integrity";

/**
 * Read-only snapshot of one device's own sync state. Every query here is a
 * SELECT — see docs/superpowers/specs/2026-10-08-device-diagnostics-console-design.md
 * for why this exists and what it is allowed to do.
 */

export interface QueuedItemSummary {
  table_name: string;
  pending: number;
  retrying: number;
  oldest: string | null;
  last_error: string | null;
}

export interface SyncStateRow {
  table_name: string;
  last_synced_at: string | null;
  server_cursor: string | null;
}

export interface PendingDeltaRow {
  movement_id: string;
  stock_batch_id: string;
  quantity: number;
  attempts: number;
}

export interface ResolutionCounts {
  products: number;
  unresolvableCategory: number;
  productsWithoutBatches: number;
  batchesWithoutMovements: number;
}

export interface DeviceDiagnostics {
  queue: QueuedItemSummary[];
  queueTotal: number;
  /** Of queueTotal. The dashboard indicator excludes these, so showing one
   * number made the two disagree and sent support chasing the difference. */
  crashTelemetryQueued: number;
  syncState: SyncStateRow[];
  pendingDeltas: PendingDeltaRow[];
  deltas: DeltaHealth;
  /** Unresolved only. This counted resolved rows too. */
  conflicts: number;
  integrity: StockIntegrityReport;
  resolution: ResolutionCounts;
  stuckRows: StuckRow[];
  orphans: OrphanCount[];
  crashes: CrashRow[];
  clock: ClockState;
  missingTables: string[];
}

async function queueSummary(): Promise<QueuedItemSummary[]> {
  return query<QueuedItemSummary>(
    `SELECT table_name,
            COUNT(*) AS pending,
            SUM(CASE WHEN retry_count > 0 THEN 1 ELSE 0 END) AS retrying,
            MIN(created_at) AS oldest,
            (SELECT q.last_error FROM _sync_queue q
               WHERE q.table_name = _sync_queue.table_name
                 AND q.last_error IS NOT NULL
               ORDER BY q.created_at DESC LIMIT 1) AS last_error
       FROM _sync_queue
      GROUP BY table_name
      ORDER BY pending DESC`,
  );
}

async function countOf(sql: string, params: unknown[] = []): Promise<number> {
  const rows = await query<{ count: number }>(sql, params as never[]);
  return Number(rows[0]?.count ?? 0);
}

async function resolutionCounts(storeId: string | null): Promise<ResolutionCounts> {
  const scope = storeId ? " AND p.store_id = ?" : "";
  const args = storeId ? [storeId] : [];

  return {
    products: await countOf(
      `SELECT COUNT(*) AS count FROM products p WHERE p._deleted = 0${scope}`,
      args,
    ),
    // The shape behind A-189: a category_id pointing at a row this device
    // will never receive renders "Uncategorized" forever.
    unresolvableCategory: await countOf(
      `SELECT COUNT(*) AS count FROM products p
        WHERE p._deleted = 0${scope}
          AND p.category_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM categories c WHERE c.id = p.category_id AND c._deleted = 0
          )`,
      args,
    ),
    productsWithoutBatches: await countOf(
      `SELECT COUNT(*) AS count FROM products p
        WHERE p._deleted = 0${scope}
          AND NOT EXISTS (
            SELECT 1 FROM stock_batches sb
             WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1
          )`,
      args,
    ),
    batchesWithoutMovements: await countOf(
      `SELECT COUNT(*) AS count FROM stock_batches sb
        WHERE sb._deleted = 0 AND sb.is_active = 1 AND sb.quantity > 0
          ${storeId ? "AND sb.store_id = ?" : ""}
          AND NOT EXISTS (
            SELECT 1 FROM stock_movements sm
             WHERE sm.stock_batch_id = sb.id AND sm._deleted = 0
          )`,
      args,
    ),
  };
}

export async function collectDeviceDiagnostics(): Promise<DeviceDiagnostics> {
  const storeId = getActiveStoreId();

  const [queue, syncState, pendingDeltas, conflicts, integrity, resolution] =
    await Promise.all([
      queueSummary(),
      query<SyncStateRow>(
        "SELECT table_name, last_synced_at, server_cursor FROM _sync_state ORDER BY table_name",
      ),
      query<PendingDeltaRow>(
        `SELECT movement_id, stock_batch_id, quantity, attempts
           FROM _pending_stock_deltas ORDER BY attempts DESC LIMIT 50`,
      ),
      countOf(
        "SELECT COUNT(*) AS count FROM _sync_conflicts WHERE resolved_at IS NULL",
      ),
      verifyStockIntegrity(),
      resolutionCounts(storeId),
    ]);

  const [crashTelemetry, stuckRows, orphans, crashes, clock, missing, deltas] =
    await Promise.all([
      crashTelemetryQueued(),
      stuckQueueRows(),
      orphanedUnsyncedRows(),
      recentCrashes(),
      clockState(),
      missingTables(),
      deltaHealth(),
    ]);

  return {
    queue,
    queueTotal: queue.reduce((total, row) => total + Number(row.pending ?? 0), 0),
    crashTelemetryQueued: crashTelemetry,
    syncState,
    pendingDeltas,
    deltas,
    conflicts,
    integrity,
    resolution,
    stuckRows,
    orphans,
    crashes,
    clock,
    missingTables: missing,
  };
}

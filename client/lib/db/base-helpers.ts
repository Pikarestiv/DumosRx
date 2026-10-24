import {
  execute,
  query,
  generateId,
  logAction,
  getActiveStoreId,
  STORE_SCOPED_TABLES,
  registerInvalidateTablesFn,
  queueTableInvalidation,
  transaction,
  isInTransaction,
} from "./core";
import { deviceHoldsSeveralStores } from "./device-stores";
import {
  isTillInspectionSession,
  READ_ONLY_REFUSAL_MESSAGE,
} from "@/lib/utils/till-inspection";
import { movementChange, resolveBatchQuantity } from "./batch-quantity";
import type { BatchLogChange } from "./batch-quantity";
import { queryClient } from "../query-client";
import { addToSyncQueue } from "./sync-queue";

export { getPendingSyncItems, markSynced, markConflictSettled, recordSyncFailure } from "./sync-queue";

// Invalidates exactly the queries that could be affected by a mutation on `table`, matched via each query's `meta.tables` (see lib/query-keys.…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L29
function invalidateQueriesForTable(table: string) {
  if (typeof window === "undefined") return;
  void queryClient.invalidateQueries({
    predicate: (q) => {
      const tables = q.meta?.tables as string[] | undefined;
      return !tables || tables.includes(table);
    },
  });
}

registerInvalidateTablesFn((tables) => {
  for (const table of tables) invalidateQueriesForTable(table);
});

// Return type of assertStoreOwnership() — see its doc comment.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-ts-L52
type OwnershipCheck =
  | { needsClaim: true; activeStoreId: string }
  | { needsClaim: false };

// Enforces per-row store ownership before update()/softDelete()/remove() mutate a STORE_SCOPED_TABLES row, closing the cross-tenant write gap…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-L62
async function assertStoreOwnership(
  table: string,
  id: string,
  overrideStoreId?: string,
): Promise<OwnershipCheck> {
  if (!STORE_SCOPED_TABLES.includes(table)) return { needsClaim: false };

  const activeStoreId = overrideStoreId ?? getActiveStoreId();
  if (!activeStoreId) return { needsClaim: false };

  const rows = await query<{ store_id: string | null }>(
    `SELECT store_id FROM ${table} WHERE id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return { needsClaim: false }; // No such row; let the caller's own statement naturally no-op.

  if (row.store_id === null || row.store_id === undefined) {
    return (await deviceHoldsSeveralStores()) ? { needsClaim: false } : { needsClaim: true, activeStoreId };
  }

  if (row.store_id !== activeStoreId) {
    throw new Error("Cannot modify a record owned by a different store");
  }

  return { needsClaim: false };
}

// Every products.name / categories.name write funnels through insert()/ update() below (local-database.ts just re-exports these), so normalizi…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L90
const LOWERCASE_NAME_TABLES = new Set(["products", "categories"]);

function withNormalizedName(
  table: string,
  record: Record<string, unknown>,
): Record<string, unknown> {
  if (LOWERCASE_NAME_TABLES.has(table) && typeof record.name === "string") {
    return { ...record, name: record.name.trim().toLowerCase() };
  }
  return record;
}

// The one choke point every local write passes through; see client/AGENTS.md,
// "On-till admin inspection", for what deliberately bypasses it.
function assertWritable(): void {
  if (isTillInspectionSession()) {
    throw new Error(READ_ONLY_REFUSAL_MESSAGE);
  }
}

// Every local writer of a `stock_movements` row passes through insert() or softDelete(), so rebuilding the batch here covers all ten of them —…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-ts-L121
async function syncBatchQuantityForMovement(
  record: Record<string, unknown>,
  change: BatchLogChange,
  options?: { storeId?: string; correlationId?: string },
): Promise<void> {
  const batchId = record.stock_batch_id;
  if (typeof batchId !== "string" || !batchId) return;

  const resolved = await resolveBatchQuantity(batchId, change);
  // A batch created holding its first movement's quantity (a receipt, an import row, a transfer-in) is already right, and writing it again costs…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L128
  if (!resolved || resolved.quantity === resolved.stored) return;

  // The movement's own options are forwarded:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L133
  await update("stock_batches", batchId, { quantity: resolved.quantity }, options);
}

export async function insert(
  table: string,
  data: Record<string, unknown>,
  options?: { action?: string; storeId?: string; correlationId?: string },
): Promise<string> {
  assertWritable();

  const id = (data.id as string) || generateId();
  const now = new Date().toISOString();

  const storeId = getActiveStoreId();
  const record: Record<string, unknown> = withNormalizedName(table, {
    ...data,
    id,
    created_at: data.created_at || now,
    updated_at: now,
    _version: 1,
    _synced: 0,
    // Auto-scope to the active store unless the caller already set one explicitly (e.g.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L157
    ...(storeId && STORE_SCOPED_TABLES.includes(table) && data.store_id == null
      ? { store_id: storeId }
      : {}),
  });

  const columns = Object.keys(record);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((col) => record[col]) as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  // The row write, its sync-queue entry, and its audit-log entry must land together:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L178
  const writeRow = async () => {
    await execute(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    await addToSyncQueue(table, id, "INSERT", record);
    // "feedback" holds background crash/error telemetry (see error-logger.ts), not a user action; logging it here would surface every silent crash…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L196
    if (table !== "feedback") {
      await logAction(options?.action || "INSERT", table, id, record, options?.storeId, options?.correlationId);
    }

    if (table === "stock_movements" && !record._deleted) {
      await syncBatchQuantityForMovement(
        record,
        movementChange(Number(record.quantity ?? 0)),
        options,
      );
    }
  };

  if (isInTransaction()) {
    await writeRow();
  } else {
    await transaction(writeRow);
  }

  queueTableInvalidation(table);

  return id;
}

export async function update(
  table: string,
  id: string,
  data: Record<string, unknown>,
  options?: { action?: string; storeId?: string; correlationId?: string },
): Promise<void> {
  assertWritable();

  const ownership = await assertStoreOwnership(table, id, options?.storeId);

  const now = new Date().toISOString();

  // _version is deliberately NOT incremented here.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L235
  const current = await query<{ _version: number }>(
    `SELECT _version FROM ${table} WHERE id = ?`,
    [id],
  );
  const version = current[0]?._version || 0;

  const record = withNormalizedName(table, {
    ...data,
    updated_at: now,
    _version: version,
    _synced: 0,
    // Folded into the same record as the rest of the edit (rather than a separate UPDATE statement) so the claim is included in BOTH the local wri…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L261
    ...(ownership.needsClaim ? { store_id: ownership.activeStoreId } : {}),
  });

  const setClause = Object.keys(record)
    .map((col) => `${col} = ?`)
    .join(", ");
  const values = [...Object.values(record), id] as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  // See insert()'s comment above:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L284
  const writeUpdate = async () => {
    await execute(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values);

    await addToSyncQueue(table, id, "UPDATE", record);
    // See insert()'s matching exclusion above - "feedback" is background crash/error telemetry, not a user action.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L295
    if (table !== "feedback") {
      await logAction(options?.action || "UPDATE", table, id, record, options?.storeId, options?.correlationId);
    }
  };

  if (isInTransaction()) {
    await writeUpdate();
  } else {
    await transaction(writeUpdate);
  }

  queueTableInvalidation(table);
}

export async function softDelete(table: string, id: string, options?: { storeId?: string; correlationId?: string }): Promise<void> {
  assertWritable();

  const ownership = await assertStoreOwnership(table, id, options?.storeId);

  const voidedMovement =
    table === "stock_movements"
      ? (
          await query<{ stock_batch_id: string | null; quantity: number | null }>(
            "SELECT stock_batch_id, quantity FROM stock_movements WHERE id = ? AND _deleted = 0",
            [id],
          )
        )[0]
      : undefined;

  const now = new Date().toISOString();

  // Claim column/value folded into the same statement (rather than a separate UPDATE) so it's included in the DELETE sync payload below too — se…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L332
  const claimClause = ownership.needsClaim ? ", store_id = ?" : "";
  const claimParam = ownership.needsClaim ? [ownership.activeStoreId] : [];

  let updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0${claimClause} WHERE id = ?`;
  let params: (string | number | null)[] = [now, ...claimParam, id];

  if (table === "users") {
    const suffix = `_del_${Date.now()}`;
    updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0${claimClause}, email = email || ?, username = username || ? WHERE id = ?`;
    params = [now, ...claimParam, suffix, suffix, id];
  }

  const deletePayload: Record<string, unknown> = ownership.needsClaim
    ? { id, store_id: ownership.activeStoreId }
    : { id };

  // See insert()'s comment above: same atomicity requirement.
  const writeSoftDelete = async () => {
    await execute(updateQuery, params);

    await addToSyncQueue(table, id, "DELETE", deletePayload);
    await logAction("DELETE", table, id, { id }, options?.storeId, options?.correlationId);

    if (voidedMovement) {
      await syncBatchQuantityForMovement(
        { stock_batch_id: voidedMovement.stock_batch_id },
        movementChange(Number(voidedMovement.quantity ?? 0), false),
        options,
      );
    }
  };

  if (isInTransaction()) {
    await writeSoftDelete();
  } else {
    await transaction(writeSoftDelete);
  }

  queueTableInvalidation(table);
}

export async function remove(
  table: string,
  id: string,
  options?: { action?: string; storeId?: string; correlationId?: string },
): Promise<void> {
  assertWritable();

  // Ignores the returned needsClaim (if the row is a legacy row) — this is a hard, unrecoverable DELETE, so claiming it first only to destroy it…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L384
  await assertStoreOwnership(table, id, options?.storeId);

  // Fetched before the delete so the audit trail still has a record of what was destroyed.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L389
  const existing = await query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = ?`,
    [id],
  );

  // See insert()'s comment above: same atomicity requirement - here a torn
  // write is worse than usual, since this is a hard, unrecoverable delete.
  const writeRemove = async () => {
    await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    // Also remove any pending (not-yet-synced) queue entries for this record before queueing our own DELETE below, so a still-pending INSERT/UPDAT…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L402
    await execute(`DELETE FROM _sync_queue WHERE table_name = ? AND record_id = ?`, [table, id]);
    await addToSyncQueue(table, id, "DELETE", { id });

    await logAction(options?.action || "HARD_DELETE", table, id, existing[0] || { id }, options?.storeId, options?.correlationId);
  };

  if (isInTransaction()) {
    await writeRemove();
  } else {
    await transaction(writeRemove);
  }

  queueTableInvalidation(table);
}

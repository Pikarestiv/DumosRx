/**
 * Base CRUD Helpers
 */

import {
  execute,
  query,
  generateId,
  logAction,
  getActiveStoreId,
  STORE_SCOPED_TABLES,
  registerInvalidateTablesFn,
  queueTableInvalidation,
  awaitSettledTransactions,
  transaction,
  isInTransaction,
} from "./core";
import { queryClient } from "../query-client";
import type { SyncQueueItem } from "@/lib/types/sync";

// Invalidates exactly the queries that could be affected by a mutation on
// `table`, matched via each query's `meta.tables` (see lib/query-keys.ts),
// not queryKey prefix matching, since several queries (dashboard, BI,
// daily-close) legitimately depend on more than one table and a prefix
// match can only ever express one. A query with no `meta.tables` hasn't
// been migrated to the factory yet, so it falls back to always invalidating.
// That's the same broad behavior this replaced, just scoped down to the
// queries that haven't opted into precise tagging yet, so adopting the
// factory anywhere is strictly an improvement, never a regression.
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

/**
 * Return type of assertStoreOwnership() — see its doc comment. A
 * discriminated union (rather than an optional `activeStoreId`) so
 * TypeScript itself enforces that a claim is never applied without the id
 * to claim it for.
 */
type OwnershipCheck =
  | { needsClaim: true; activeStoreId: string }
  | { needsClaim: false };

/**
 * Enforces per-row store ownership before update()/softDelete()/remove()
 * mutate a STORE_SCOPED_TABLES row, closing the cross-tenant write gap
 * described in docs/features/_known-bugs.md item #8: without this, any
 * store could edit or delete any other store's row (or a shared legacy row
 * forever) simply by knowing its id, since every read-side
 * `WHERE store_id = ?` filter is a pure UI-level convenience with nothing
 * enforcing it on the write path.
 *
 * Three outcomes, matching the controller's ruling exactly:
 *  - row.store_id === activeStoreId → allowed, `{ needsClaim: false }`.
 *  - row.store_id is NULL (pre-migration legacy row, see
 *    backfillStoreIdOnLegacyRows in core.ts) → allowed, with
 *    `{ needsClaim: true, activeStoreId }` telling update()/softDelete()
 *    to claim it for the active store as part of their own write, so a
 *    second store touching it later hits the reject branch instead of
 *    clobbering it forever. remove() ignores `needsClaim`: it's a hard,
 *    unrecoverable DELETE, so claiming the row first only to destroy it in
 *    the very next statement protects nothing — there's no row left
 *    afterward for the claim to matter to. The delete is simply allowed
 *    outright.
 *  - row.store_id is a different, known store → rejected with a thrown
 *    Error, not a silent no-op, so a caller that ignores the failure can't
 *    mistake it for success.
 *
 * This function used to perform the claim UPDATE itself, as its own bare
 * (non-transactional) statement, before the caller's write transaction even
 * started. A crash between the two committed the claim but lost the
 * caller's actual edit — and left the row claimed by this store, so a
 * SECOND store later touching the same row was then rejected as belonging
 * to someone else, even though nothing had visibly changed from that
 * store's perspective. It now only reports whether a claim is needed;
 * update()/softDelete() apply it as the first statement inside their own
 * transaction, so the claim and the edit can only ever commit or roll back
 * together.
 *
 * Deliberately fails OPEN (does nothing, `{ needsClaim: false }`) when
 * getActiveStoreId() is null/undefined — early app boot, or another edge
 * case where the active store genuinely isn't known yet — matching
 * insert()'s existing "only auto-scope when storeId is truthy" behavior, so
 * this never blocks a legitimate write purely because store resolution
 * hasn't happened yet. This is a narrow allowance, not a general bypass: it
 * only fires when the *local* module-scope resolver has nothing set, which
 * is not something a caller can trigger from outside this process.
 *
 * `overrideStoreId`, when passed, is checked against instead of the global
 * resolver — for the one real system-level caller found to need cross-store
 * write access (stock-transfers.ts's transferStock(), which legitimately
 * writes rows in two different stores within one transaction). Everything
 * else keeps relying on the global as before; this is deliberately narrow,
 * not a general bypass callers reach for out of convenience.
 */
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
    // Legacy pre-migration row: the caller claims it for the active store
    // as part of its own write — see this function's doc comment above.
    return { needsClaim: true, activeStoreId };
  }

  if (row.store_id !== activeStoreId) {
    throw new Error("Cannot modify a record owned by a different store");
  }

  return { needsClaim: false };
}

// Every products.name / categories.name write funnels through insert()/
// update() below (local-database.ts just re-exports these), so normalizing
// here once — instead of at each of the half-dozen call sites that create or
// rename a product/category — is the single choke point that can't be missed
// by a future caller the way the case-insensitive category lookup was.
// Canonical storage is lowercase; the UI renders it uppercase via CSS
// (toggleable per store), so the stored casing never needs to match display.
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

export async function insert(
  table: string,
  data: Record<string, unknown>,
  options?: { action?: string; storeId?: string; correlationId?: string },
): Promise<string> {
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
    // Auto-scope to the active store unless the caller already set one
    // explicitly (e.g. an owner creating a user/product for a store other
    // than the one they're currently viewing).
    ...(storeId && STORE_SCOPED_TABLES.includes(table) && data.store_id === undefined
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

  // The row write, its sync-queue entry, and its audit-log entry must land
  // together: outside a transaction, execute() persists (saveDatabase()) after
  // EACH statement independently, so the app being killed between any two of
  // them (iOS backgrounding a PWA tab is aggressive about this) could leave
  // the row committed with no _sync_queue entry - silently and permanently
  // unsynced, since pushChanges() only ever reads the queue, never the table
  // itself. Wrapping in transaction() makes all three one atomic unit with a
  // single save. Skipped when already inside a caller's transaction() (e.g.
  // createSale() doing several inserts) since transaction() calls can't
  // nest - execute() there already participates in the outer transaction and
  // is just as atomic.
  const writeRow = async () => {
    await execute(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
      values,
    );

    await addToSyncQueue(table, id, "INSERT", record);
    // "feedback" holds background crash/error telemetry (see error-logger.ts),
    // not a user action; logging it here would surface every silent crash
    // report as a "Created feedback" entry in the Activity Log.
    if (table !== "feedback") {
      await logAction(options?.action || "INSERT", table, id, record, options?.storeId, options?.correlationId);
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
  const ownership = await assertStoreOwnership(table, id, options?.storeId);

  const now = new Date().toISOString();

  // _version is deliberately NOT incremented here. This is a local-edit
  // counter that must stay in lockstep with the value sent to the server for
  // conflict detection (see SyncController::push's strict-equality check),
  // not an independent local tally: two devices editing the same row from
  // the same shared ancestor version would otherwise always compute the
  // identical "next" version (pure arithmetic on the same starting number),
  // guaranteeing an undetected collision instead of a rare one — see
  // docs/features/_known-bugs.md #11. The row's `_version` now only ever
  // changes when explicitly set by a confirmed server response (push
  // acceptance — see sync-engine/push.ts's `versions` handling) or a pull
  // bringing in a newer row (pull.ts). This UPDATE still sends/stores the
  // unchanged current version as-is, so the server can tell "this edit was
  // based on the server's actual current state" (accept) from "this edit
  // was based on something stale" (reject) instead of the two colliding
  // silently.
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

  // See insert()'s comment above: the row write, its sync-queue entry, and
  // its audit-log entry must land together, or a kill between them can leave
  // an updated row that never reaches the server. The legacy-row claim (if
  // needed — see assertStoreOwnership()'s doc comment) is included here too,
  // for the same reason: it must commit atomically with the actual edit,
  // not as a separate statement beforehand.
  const writeUpdate = async () => {
    if (ownership.needsClaim) {
      await execute(`UPDATE ${table} SET store_id = ? WHERE id = ?`, [
        ownership.activeStoreId,
        id,
      ]);
    }

    await execute(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values);

    await addToSyncQueue(table, id, "UPDATE", record);
    await logAction(options?.action || "UPDATE", table, id, record, options?.storeId, options?.correlationId);
  };

  if (isInTransaction()) {
    await writeUpdate();
  } else {
    await transaction(writeUpdate);
  }

  queueTableInvalidation(table);
}

export async function softDelete(table: string, id: string, options?: { storeId?: string; correlationId?: string }): Promise<void> {
  const ownership = await assertStoreOwnership(table, id, options?.storeId);

  const now = new Date().toISOString();

  let updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0 WHERE id = ?`;
  let params: (string | number | null)[] = [now, id];

  if (table === "users") {
    const suffix = `_del_${Date.now()}`;
    updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0, email = email || ?, username = username || ? WHERE id = ?`;
    params = [now, suffix, suffix, id];
  }

  // See insert()'s comment above: same atomicity requirement. The
  // legacy-row claim (if needed) is included here too — see writeUpdate()'s
  // comment in update() above.
  const writeSoftDelete = async () => {
    if (ownership.needsClaim) {
      await execute(`UPDATE ${table} SET store_id = ? WHERE id = ?`, [
        ownership.activeStoreId,
        id,
      ]);
    }

    await execute(updateQuery, params);

    await addToSyncQueue(table, id, "DELETE", { id });
    await logAction("DELETE", table, id, { id }, options?.storeId, options?.correlationId);
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
  // Ignores the returned needsClaim (if the row is a legacy row) — this is
  // a hard, unrecoverable DELETE, so claiming it first only to destroy it
  // in the very next statement protects nothing.
  await assertStoreOwnership(table, id, options?.storeId);

  // Fetched before the delete so the audit trail still has a record of what
  // was destroyed. This is a hard, unrecoverable delete (unlike softDelete),
  // so it's the one place where NOT capturing this would leave a real blind
  // spot in the audit log.
  const existing = await query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = ?`,
    [id],
  );

  // See insert()'s comment above: same atomicity requirement - here a torn
  // write is worse than usual, since this is a hard, unrecoverable delete.
  const writeRemove = async () => {
    await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    // Also remove any pending (not-yet-synced) queue entries for this record
    // before queueing our own DELETE below, so a still-pending INSERT/UPDATE
    // doesn't race the DELETE to the server.
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

async function addToSyncQueue(
  table: string,
  recordId: string,
  operation: "INSERT" | "UPDATE" | "DELETE",
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [table, recordId, operation, JSON.stringify(payload), now],
  );
}

/**
 * `ignoreBackoff` lets an explicit, user-clicked "Sync Now" attempt the
 * whole queue immediately: a background auto-sync should respect each
 * item's exponential backoff (see recordSyncFailure), but a manual sync is
 * the user explicitly asking to retry right now, and should not silently
 * skip the entire queue (and still report "success") just because a prior
 * failure's backoff window hasn't elapsed yet.
 */
export async function getPendingSyncItems(ignoreBackoff = false) {
  // See awaitSettledTransactions()'s doc comment: without this, a
  // background auto-sync tick that lands mid-transaction (e.g. a bulk
  // import) can read and push that transaction's not-yet-committed rows,
  // orphaning them on the server if the transaction later rolls back.
  await awaitSettledTransactions();

  if (ignoreBackoff) {
    return await query<SyncQueueItem>(
      "SELECT * FROM _sync_queue ORDER BY created_at ASC",
    );
  }
  const now = new Date().toISOString();
  return await query<SyncQueueItem>(
    "SELECT * FROM _sync_queue WHERE next_retry_at IS NULL OR next_retry_at <= ? ORDER BY created_at ASC",
    [now],
  );
}

export async function markSynced(queueIds: number[]): Promise<void> {
  if (queueIds.length === 0) return;
  const placeholders = queueIds.map(() => "?").join(", ");
  await execute(`DELETE FROM _sync_queue WHERE id IN (${placeholders})`, queueIds);
}

const SYNC_FAILURE_REPORT_THRESHOLD = 5;
const SYNC_FAILURE_BASE_DELAY_MS = 30_000;
const SYNC_FAILURE_MAX_DELAY_MS = 60 * 60_000;

/**
 * Records a sync failure with exponential backoff so a permanently-bad item
 * stops being retried every cycle and blocking the rest of the queue. Once
 * retry_count crosses the report threshold, logs to superadmins exactly once
 * (via the feedback table) instead of on every subsequent retry.
 *
 * `reportImmediately` is for failures that are already known to be permanent
 * (e.g. a payload that fails client-side validation before ever reaching the
 * server) rather than possibly-transient (a network blip, a momentary server
 * error). Those would otherwise wait out the same 5-retry threshold as a
 * transient failure even though retrying can never fix them, silently
 * delaying remote visibility by up to ~waiting through 5 backoff cycles.
 */
export async function recordSyncFailure(
  queueId: number,
  errorMessage: string,
  reportImmediately = false,
): Promise<void> {
  const rows = await query<{ retry_count: number; last_error: string | null; table_name: string; record_id: string }>(
    "SELECT retry_count, last_error, table_name, record_id FROM _sync_queue WHERE id = ?",
    [queueId],
  );
  const item = rows[0];
  if (!item) return;

  const nextRetryCount = (item.retry_count || 0) + 1;
  const delay = Math.min(SYNC_FAILURE_BASE_DELAY_MS * 2 ** (nextRetryCount - 1), SYNC_FAILURE_MAX_DELAY_MS);
  const nextRetryAt = new Date(Date.now() + delay).toISOString();
  const alreadyReported = item.last_error?.startsWith("[REPORTED]");
  const shouldReport =
    (reportImmediately || nextRetryCount >= SYNC_FAILURE_REPORT_THRESHOLD) && !alreadyReported;

  // Preserve the "[REPORTED]" marker once it's set: writing the bare
  // errorMessage here unconditionally used to clobber it on every later
  // call, so `alreadyReported` flipped back to false every other retry and
  // logCrash() fired again and again instead of exactly once.
  const nextLastError =
    alreadyReported || shouldReport ? `[REPORTED] ${errorMessage}` : errorMessage;

  await execute(
    "UPDATE _sync_queue SET retry_count = ?, last_error = ?, next_retry_at = ? WHERE id = ?",
    [nextRetryCount, nextLastError, nextRetryAt, queueId],
  );

  if (shouldReport) {
    try {
      const { logCrash } = await import("../utils/error-logger");
      await logCrash(
        new Error(
          `Sync item stuck after ${nextRetryCount} attempts on ${item.table_name}/${item.record_id}: ${errorMessage}`,
        ),
        false,
        { area: "sync", table: item.table_name, recordId: item.record_id },
      );
    } catch (e) {
      console.error("Failed to report stuck sync item", e);
    }
  }
}

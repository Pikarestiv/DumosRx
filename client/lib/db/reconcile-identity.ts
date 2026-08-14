import { execute, query, transaction, STORE_SCOPED_TABLES } from "./core";

/**
 * One-time recovery tool for devices that hit the pre-fix local-first setup
 * bug: `handleRegister()` used to generate local-only user/store ids that
 * were never reconciled to the server once the device later linked to a
 * cloud account (see use-onboarding.ts and the Aug 2026 multi-store
 * investigation). Every row referencing those local-only ids as a foreign
 * key (sales.cashier_id, stock_movements.performed_by, etc.) became
 * permanently unsyncable, since the server never had a matching row to
 * satisfy the FK constraint.
 *
 * Not a permanent code path — new setups can no longer create this state
 * (handleRegister now always creates the account+store in the cloud first),
 * so this only exists to repair devices affected before that fix shipped.
 * Invoke manually (e.g. via a temporary browser debug hook), not from any
 * normal app flow.
 */

/** Tables + column(s) that can hold a reference to the acting user's id. */
const USER_REFERENCING_COLUMNS: { table: string; column: string }[] = [
  { table: "sales", column: "user_id" },
  { table: "prescriptions", column: "user_id" },
  { table: "returns", column: "user_id" },
  { table: "expenses", column: "user_id" },
  { table: "audit_logs", column: "user_id" },
  { table: "purchase_orders", column: "ordered_by" },
  { table: "stock_audits", column: "user_id" },
  { table: "loyalty_tiers", column: "user_id" },
  { table: "loyalty_redemption_options", column: "user_id" },
  { table: "feedback", column: "user_id" },
  { table: "stock_movements", column: "performed_by" },
  { table: "payment_accounts", column: "user_id" },
];

export interface ReconcileIdentityOptions {
  /** Local-only store id to replace, e.g. one created before this device was ever cloud-linked. */
  oldStoreId: string;
  /** Real, server-authoritative store id to replace it with. */
  newStoreId: string;
  /** Local-only user id to replace. */
  oldUserId: string;
  /** Real, server-authoritative user id to replace it with. */
  newUserId: string;
}

export interface ReconcileIdentityResult {
  storeRowsRemapped: Record<string, number>;
  userRowsRemapped: Record<string, number>;
}

/**
 * Separate, narrower repair for a related symptom found on the same device:
 * some rows created during the same pre-cloud-link period are marked
 * `_synced = 0` locally but have no corresponding `_sync_queue` entry at
 * all — so `pushChanges()` (which only ever reads from `_sync_queue`, never
 * scans tables directly) has silently never attempted to push them. Backfill
 * a fresh INSERT queue entry for any such row so it's picked up on the next
 * push, using the row's current column values as the payload (matching the
 * shape `insert()` in base-helpers.ts already produces).
 */
export async function requeueOrphanedRows(
  tables: string[],
): Promise<Record<string, number>> {
  const requeued: Record<string, number> = {};

  await transaction(async () => {
    for (const table of tables) {
      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM ${table}
         WHERE (_synced = 0 OR _synced IS NULL)
           AND (_deleted = 0 OR _deleted IS NULL)
           AND id NOT IN (SELECT record_id FROM _sync_queue WHERE table_name = ?)`,
        [table],
      );

      for (const row of rows) {
        await execute(
          `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            table,
            row.id as string,
            "INSERT",
            JSON.stringify(row),
            (row.created_at as string) || new Date().toISOString(),
          ],
        );
      }

      if (rows.length > 0) {
        requeued[table] = rows.length;
      }
    }
  });

  return requeued;
}

export async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [table],
  );
  return rows.length > 0;
}

export async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

/**
 * Rewrites every reference to `oldId` (across the given table/column pairs)
 * to `newId`, including any already-queued `_sync_queue` payload that still
 * has the old id baked into its frozen JSON snapshot — marking a live row
 * `_synced = 0` alone doesn't requeue it, since push only ever reads from
 * `_sync_queue`, never re-scans the table. Shared by both the one-time
 * device-identity repair below and pull.ts's ongoing duplicate-name
 * reconciliation for categories/suppliers.
 *
 * `runSql` lets a caller that already manages its own raw transaction (e.g.
 * pull.ts, which issues `rawDb.run("BEGIN")` directly rather than going
 * through this module's `transaction()` wrapper) supply its own statement
 * runner. Defaults to this module's `execute()` — safe there because every
 * call site that omits `runSql` is already wrapped in `transaction()`,
 * which sets the `inTransaction` flag `execute()` checks before triggering
 * a `saveDatabase()` export. Calling `execute()` directly from *outside*
 * that wrapper (as pull.ts's manual transaction does) would trigger an
 * unwanted mid-transaction `saveDatabase()` — sql.js's `db.export()`
 * implicitly closes the open transaction, so pull.ts's own later `COMMIT`
 * would then fail with "cannot commit - no transaction is active".
 */
export async function remapForeignKey(
  oldId: string,
  newId: string,
  refs: { table: string; column: string }[],
  runSql: (sql: string, params: (string | number | null)[]) => void | Promise<void> = execute,
): Promise<void> {
  for (const { table, column } of refs) {
    if (!(await tableExists(table)) || !(await columnExists(table, column))) continue;
    await runSql(
      `UPDATE ${table} SET ${column} = ?, _synced = 0 WHERE ${column} = ?`,
      [newId, oldId],
    );
  }

  // Plain string substitution is safe here since ids are unique,
  // unambiguous tokens with no risk of colliding with other JSON content.
  await runSql("UPDATE _sync_queue SET payload = REPLACE(payload, ?, ?) WHERE payload LIKE ?", [
    oldId,
    newId,
    `%${oldId}%`,
  ]);
}

/**
 * Remaps every local row referencing `oldStoreId`/`oldUserId` to the real
 * server ids, marks touched rows unsynced so they get re-pushed with valid
 * foreign keys, and soft-deletes the now-orphaned local-only store/user rows.
 */
export async function reconcileIdentity(
  options: ReconcileIdentityOptions,
): Promise<ReconcileIdentityResult> {
  const { oldStoreId, newStoreId, oldUserId, newUserId } = options;
  const storeRowsRemapped: Record<string, number> = {};
  const userRowsRemapped: Record<string, number> = {};

  await transaction(async () => {
    for (const table of STORE_SCOPED_TABLES) {
      if (!(await tableExists(table)) || !(await columnExists(table, "store_id"))) continue;
      const before = await query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE store_id = ?`,
        [oldStoreId],
      );
      const count = before[0]?.cnt ?? 0;
      if (count > 0) {
        await execute(
          `UPDATE ${table} SET store_id = ?, _synced = 0 WHERE store_id = ?`,
          [newStoreId, oldStoreId],
        );
        storeRowsRemapped[table] = count;
      }
    }

    for (const { table, column } of USER_REFERENCING_COLUMNS) {
      if (!(await tableExists(table)) || !(await columnExists(table, column))) continue;
      const before = await query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE ${column} = ?`,
        [oldUserId],
      );
      const count = before[0]?.cnt ?? 0;
      if (count > 0) {
        await execute(
          `UPDATE ${table} SET ${column} = ?, _synced = 0 WHERE ${column} = ?`,
          [newUserId, oldUserId],
        );
        userRowsRemapped[table] = count;
      }
    }

    // Rename the local user's own id in place (not soft-delete) — this row
    // holds the only local username/PIN credential for this device's login,
    // so deleting it outright would lock the device out. Also point it at
    // the real store and re-flag for sync so the identity fix itself reaches
    // the server, not just the rows that referenced it.
    await execute(
      "UPDATE users SET id = ?, store_id = ?, _deleted = 0, _synced = 0 WHERE id = ?",
      [newUserId, newStoreId, oldUserId],
    );

    await execute("UPDATE stores SET _deleted = 1 WHERE id = ?", [oldStoreId]);

    // Marking table rows _synced = 0 above does NOT requeue them — push.ts
    // reads straight from `_sync_queue.payload`, a JSON snapshot frozen at
    // the moment the row was originally inserted/updated, independent of
    // the row's current `_synced` flag. Any already-queued entry for these
    // rows still has the old ids baked into its stored payload and would
    // keep failing the same FK check server-side. Rewrite those payloads in
    // place — a plain string substitution is safe here since UUIDs are
    // unique, unambiguous tokens with no risk of colliding with other JSON
    // content.
    await execute("UPDATE _sync_queue SET payload = REPLACE(payload, ?, ?) WHERE payload LIKE ?", [
      oldStoreId,
      newStoreId,
      `%${oldStoreId}%`,
    ]);
    await execute("UPDATE _sync_queue SET payload = REPLACE(payload, ?, ?) WHERE payload LIKE ?", [
      oldUserId,
      newUserId,
      `%${oldUserId}%`,
    ]);
  });

  return { storeRowsRemapped, userRowsRemapped };
}

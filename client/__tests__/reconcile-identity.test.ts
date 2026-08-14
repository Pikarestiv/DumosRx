import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression test for the real incident this session: a device used
 * offline before ever linking to a cloud account generated local-only
 * ids for its store and user, which were never reconciled to the
 * server's real ids once the device linked. Every row referencing those
 * local-only ids as a foreign key became permanently unsyncable (see
 * push.ts / SyncController::push FK failures). reconcile-identity.ts is
 * the one-time repair tool built to fix an affected device; this test
 * proves it against a genuine in-memory SQLite engine.
 */
describe("reconcile-identity.ts", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let reconcileIdentity: typeof import("@/lib/db/reconcile-identity").reconcileIdentity;
  let requeueOrphanedRows: typeof import("@/lib/db/reconcile-identity").requeueOrphanedRows;

  const OLD_STORE = "old-local-store";
  const NEW_STORE = "real-server-store";
  const OLD_USER = "old-local-user";
  const NEW_USER = "real-server-user";

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ reconcileIdentity, requeueOrphanedRows } = await import(
      "@/lib/db/reconcile-identity"
    ));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE sales ADD COLUMN store_id TEXT;`);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM stores; DELETE FROM products; DELETE FROM sales;
      DELETE FROM users; DELETE FROM audit_logs; DELETE FROM _sync_queue;
    `);
  });

  it("remaps store_id across STORE_SCOPED_TABLES and soft-deletes the phantom store", async () => {
    db.run(`INSERT INTO stores (id, name, _deleted) VALUES (?, 'Old Local Store', 0)`, [OLD_STORE]);
    db.run(`INSERT INTO stores (id, name, _deleted) VALUES (?, 'Real Cloud Store', 0)`, [NEW_STORE]);
    db.run(`INSERT INTO products (id, name, store_id, _deleted) VALUES ('p1', 'Panadol', ?, 0)`, [OLD_STORE]);
    db.run(`INSERT INTO users (id, first_name, last_name, username, pin, role, _deleted) VALUES (?, 'Old', 'User', 'olduser', '1234', 'store_owner', 0)`, [OLD_USER]);

    const result = await reconcileIdentity({
      oldStoreId: OLD_STORE,
      newStoreId: NEW_STORE,
      oldUserId: OLD_USER,
      newUserId: NEW_USER,
    });

    expect(result.storeRowsRemapped.products).toBe(1);

    const product = db.exec(`SELECT store_id, _synced FROM products WHERE id = 'p1'`);
    expect(product[0].values[0][0]).toBe(NEW_STORE);
    expect(product[0].values[0][1]).toBe(0);

    const oldStoreRow = db.exec(`SELECT _deleted FROM stores WHERE id = '${OLD_STORE}'`);
    expect(oldStoreRow[0].values[0][0]).toBe(1);
  });

  it("renames the local user's own id in place rather than deleting it, preserving login credentials", async () => {
    db.run(`INSERT INTO stores (id, name, _deleted) VALUES (?, 'Real Cloud Store', 0)`, [NEW_STORE]);
    db.run(`INSERT INTO users (id, first_name, last_name, username, pin, role, _deleted) VALUES (?, 'Old', 'User', 'olduser', '1234', 'store_owner', 0)`, [OLD_USER]);
    db.run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, user_id, _deleted) VALUES ('s1', 'TXN-1', 100, 100, '2026-08-01', ?, 0)`, [OLD_USER]);

    await reconcileIdentity({
      oldStoreId: OLD_STORE,
      newStoreId: NEW_STORE,
      oldUserId: OLD_USER,
      newUserId: NEW_USER,
    });

    // The user row is renamed in place, not soft-deleted — deleting it
    // outright would remove the device's only local login credential.
    const renamedUser = db.exec(`SELECT username, _deleted FROM users WHERE id = '${NEW_USER}'`);
    expect(renamedUser[0].values[0][0]).toBe("olduser");
    expect(renamedUser[0].values[0][1]).toBe(0);

    const oldUserRow = db.exec(`SELECT COUNT(*) as cnt FROM users WHERE id = '${OLD_USER}'`);
    expect(oldUserRow[0].values[0][0]).toBe(0);

    const sale = db.exec(`SELECT user_id, _synced FROM sales WHERE id = 's1'`);
    expect(sale[0].values[0][0]).toBe(NEW_USER);
    expect(sale[0].values[0][1]).toBe(0);
  });

  it("rewrites stale ids already baked into queued _sync_queue payloads, not just the live rows", async () => {
    db.run(`INSERT INTO stores (id, name, _deleted) VALUES (?, 'Real Cloud Store', 0)`, [NEW_STORE]);
    db.run(`INSERT INTO users (id, first_name, last_name, username, pin, role, _deleted) VALUES (?, 'Old', 'User', 'olduser', '1234', 'store_owner', 0)`, [OLD_USER]);
    db.run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, user_id, _deleted) VALUES ('s1', 'TXN-1', 100, 100, '2026-08-01', ?, 0)`, [OLD_USER]);
    const staleQueuePayload = JSON.stringify({ id: "s1", user_id: OLD_USER, transaction_number: "TXN-1" });
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES ('sales', 's1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [staleQueuePayload],
    );

    await reconcileIdentity({
      oldStoreId: OLD_STORE,
      newStoreId: NEW_STORE,
      oldUserId: OLD_USER,
      newUserId: NEW_USER,
    });

    const queueRow = db.exec(`SELECT payload FROM _sync_queue WHERE record_id = 's1'`);
    const payload = JSON.parse(queueRow[0].values[0][0] as string);
    expect(payload.user_id).toBe(NEW_USER);
  });

  it("requeueOrphanedRows backfills a missing _sync_queue entry for a row marked unsynced with none", async () => {
    db.run(`INSERT INTO stores (id, name, _deleted) VALUES (?, 'Real Cloud Store', 0)`, [NEW_STORE]);
    // Simulate a row that predates the sync-queue mechanism: _synced = 0
    // but no corresponding _sync_queue entry exists at all.
    db.run(`INSERT INTO products (id, name, store_id, _deleted, _synced, created_at) VALUES ('orphan-p', 'Orphan Product', ?, 0, 0, '2026-07-20T00:00:00Z')`, [NEW_STORE]);

    const result = await requeueOrphanedRows(["products"]);

    expect(result.products).toBe(1);
    const queued = db.exec(`SELECT table_name, record_id, operation FROM _sync_queue WHERE record_id = 'orphan-p'`);
    expect(queued[0].values[0][0]).toBe("products");
    expect(queued[0].values[0][2]).toBe("INSERT");
  });

  it("does not requeue a row that already has a pending queue entry", async () => {
    db.run(`INSERT INTO stores (id, name, _deleted) VALUES (?, 'Real Cloud Store', 0)`, [NEW_STORE]);
    db.run(`INSERT INTO products (id, name, store_id, _deleted, _synced, created_at) VALUES ('p-with-queue', 'Has Queue', ?, 0, 0, '2026-07-20T00:00:00Z')`, [NEW_STORE]);
    db.run(`INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES ('products', 'p-with-queue', 'INSERT', '{}', '2026-07-20T00:00:00Z')`);

    const result = await requeueOrphanedRows(["products"]);

    expect(result.products).toBeUndefined();
    const queueCount = db.exec(`SELECT COUNT(*) as cnt FROM _sync_queue WHERE record_id = 'p-with-queue'`);
    expect(queueCount[0].values[0][0]).toBe(1);
  });
});

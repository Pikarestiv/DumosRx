import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Coverage driven by the 2026-10-09 audit of this view against real incidents:
 * each query here exists because a past bug was invisible without it.
 */
const STORE_ID = "store-1";

describe("diagnostics detail queries", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let detail: typeof import("@/lib/db/queries/diagnostics-detail");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    detail = await import("@/lib/db/queries/diagnostics-detail");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM _sync_queue; DELETE FROM feedback; DELETE FROM products;
       DELETE FROM stores; DELETE FROM _pending_stock_deltas;
       DELETE FROM stock_movements;`,
    );
  });

  it("surfaces the store_id inside a frozen payload, which is what A-162 lacked", async () => {
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at, retry_count, last_error)
       VALUES ('permission_groups', 'pg-1', 'INSERT',
               '{"id":"pg-1","store_id":"a-different-store"}',
               '2026-10-01T09:00:00Z', 9, 'SQLSTATE[23000]: Integrity constraint violation')`,
    );

    const rows = await detail.stuckQueueRows();

    expect(rows).toHaveLength(1);
    expect(rows[0].payload_store_id).toBe("a-different-store");
    expect(rows[0].retry_count).toBe(9);
  });

  it("reduces a driver error to a class, never quoting the attempted statement", async () => {
    // A sync last_error's first 300 chars can be the SQL head with bound
    // values — a password hash, a customer's details. The class is safe to
    // put on screen and in a pasted ticket; the raw string is not.
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at, retry_count, last_error)
       VALUES ('products', 'p1', 'UPDATE', '{}', '2026-10-01T09:00:00Z', 7,
               'SQLSTATE[23000]: INSERT INTO users (pin) VALUES (''$2y$12$secrethash'')')`,
    );

    const rows = await detail.stuckQueueRows();

    expect(rows[0].reason).not.toMatch(/secrethash/);
    expect(rows[0].reason).not.toMatch(/INSERT INTO/);
  });

  it("ignores rows that have not retried enough to be stuck", async () => {
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at, retry_count)
       VALUES ('products', 'p1', 'UPDATE', '{}', '2026-10-01T09:00:00Z', 1)`,
    );

    expect(await detail.stuckQueueRows()).toEqual([]);
  });

  it("counts rows that will be re-queued on the next boot", async () => {
    // _synced = 0 with no queue entry: invisible between boots, and the shape
    // behind the repeated "changes could not be saved" loops.
    db.run(
      `INSERT INTO products (id, name, _deleted, _synced, store_id)
       VALUES ('orphan', 'paracetamol', 0, 0, '${STORE_ID}'),
              ('queued', 'ibuprofen', 0, 0, '${STORE_ID}')`,
    );
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('products', 'queued', 'INSERT', '{}', '2026-10-01T09:00:00Z')`,
    );

    const orphans = await detail.orphanedUnsyncedRows();
    const products = orphans.find((row) => row.table_name === "products");

    expect(products?.count).toBe(1);
  });

  it("reads the on-device crash log, newest first", async () => {
    db.run(
      `INSERT INTO feedback (id, type, content, fingerprint, occurrence_count, last_occurred_at, _deleted, _synced)
       VALUES ('f1', 'bug', 'boom', 'catalog|Cannot read x|at Foo', 4, '2026-10-09T10:00:00Z', 0, 0),
              ('f2', 'bug', 'bang', 'sync|Timed out|at Bar', 1, '2026-10-09T12:00:00Z', 0, 1)`,
    );

    const crashes = await detail.recentCrashes();

    expect(crashes[0].area).toBe("sync");
    expect(crashes[1].area).toBe("catalog");
    expect(crashes[1].message).toBe("Cannot read x");
    expect(crashes[1].occurrence_count).toBe(4);
    expect(crashes[1].synced).toBe(false);
  });

  it("excludes a non-crash feedback row from the crash log", async () => {
    db.run(
      `INSERT INTO feedback (id, type, content, fingerprint, _deleted)
       VALUES ('f1', 'feature_request', 'please add X', NULL, 0)`,
    );

    expect(await detail.recentCrashes()).toEqual([]);
  });

  it("reports a watermark ahead of the device clock, the A-191 lockout shape", async () => {
    const ahead = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    db.run(
      `INSERT INTO stores (id, name, last_monotonic_time, subscription_tier, status)
       VALUES ('${STORE_ID}', 'Agidi', '${ahead}', 'pro', 'active')`,
    );

    const clock = await detail.clockState();

    expect(clock.watermarkAheadMs).toBeGreaterThan(11 * 3600 * 1000);
    expect(clock.tier).toBe("pro");
  });

  it("never reads the licence token", async () => {
    db.run(
      `INSERT INTO stores (id, name, license_token, last_monotonic_time)
       VALUES ('${STORE_ID}', 'Agidi', 'super-secret-token', '2026-10-01T00:00:00Z')`,
    );

    const clock = await detail.clockState();

    expect(JSON.stringify(clock)).not.toMatch(/super-secret-token/);
  });

  it("counts deltas whose product is gone, which a resync cannot clear", async () => {
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted)
       VALUES ('m1', 'gone', 'b1', 'purchase', 5, 0)`,
    );
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('m1', 'b1', 5, 14)`,
    );

    const health = await detail.deltaHealth();

    expect(health.total).toBe(1);
    expect(health.maxAttempts).toBe(14);
    expect(health.chronic).toBe(1);
    expect(health.productMissing).toBe(1);
  });

  it("reports no missing tables on a correctly built database", async () => {
    expect(await detail.missingTables()).toEqual([]);
  });
});

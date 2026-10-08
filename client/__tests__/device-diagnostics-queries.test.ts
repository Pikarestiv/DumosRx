import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * The diagnostics console exists because none of this was reachable from
 * inside the app during the 2026-10-08 incident: the sync queue, how far each
 * table had synced, unapplied stock deltas and unresolvable categories all had
 * to be relayed by hand or guessed at. See
 * docs/superpowers/specs/2026-10-08-device-diagnostics-console-design.md.
 *
 * Everything it runs must be a SELECT.
 */
describe("collectDeviceDiagnostics", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let collectDeviceDiagnostics: typeof import("@/lib/db/queries/diagnostics").collectDeviceDiagnostics;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ collectDeviceDiagnostics } = await import("@/lib/db/queries/diagnostics"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM products; DELETE FROM categories; DELETE FROM stock_batches;
       DELETE FROM stock_movements; DELETE FROM _sync_queue; DELETE FROM _sync_state;
       DELETE FROM _pending_stock_deltas;`,
    );
  });

  function snapshot(): string {
    return JSON.stringify(
      [
        "products",
        "categories",
        "stock_batches",
        "stock_movements",
        "_sync_queue",
        "_sync_state",
        "_pending_stock_deltas",
      ].map((table) => db.exec(`SELECT * FROM ${table}`)),
    );
  }

  it("reports an empty device as empty rather than throwing", async () => {
    const report = await collectDeviceDiagnostics();

    expect(report.queueTotal).toBe(0);
    expect(report.queue).toEqual([]);
    expect(report.pendingDeltas).toEqual([]);
    expect(report.resolution.products).toBe(0);
  });

  it("summarises the sync queue by table, surfacing the last error", async () => {
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at, retry_count, last_error)
       VALUES ('products', 'p1', 'UPDATE', '{}', '2026-10-08T10:00:00Z', 3, 'Invalid category_id'),
              ('products', 'p2', 'UPDATE', '{}', '2026-10-08T11:00:00Z', 0, NULL),
              ('sales', 's1', 'INSERT', '{}', '2026-10-08T12:00:00Z', 0, NULL)`,
    );

    const report = await collectDeviceDiagnostics();

    expect(report.queueTotal).toBe(3);
    const products = report.queue.find((row) => row.table_name === "products");
    expect(products?.pending).toBe(2);
    expect(products?.retrying).toBe(1);
    expect(products?.last_error).toBe("Invalid category_id");
  });

  it("counts a product whose category this device cannot resolve", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('c-live', 'drugs', 0)`);
    db.run(
      `INSERT INTO products (id, name, category_id, _deleted) VALUES
         ('p-ok', 'panadol', 'c-live', 0),
         ('p-orphan', 'vitamin c', 'c-missing', 0),
         ('p-none', 'bandage', NULL, 0)`,
    );

    const report = await collectDeviceDiagnostics();

    expect(report.resolution.products).toBe(3);
    // A NULL category is honestly uncategorised; a dangling id is the A-189
    // shape and the one worth surfacing.
    expect(report.resolution.unresolvableCategory).toBe(1);
  });

  it("counts batches holding stock with nothing in the log behind them", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted)
       VALUES ('b-explained', 'p1', 'Opening Stock', 5, 1, 0),
              ('b-orphan', 'p2', 'Opening Stock', 40, 1, 0)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted)
       VALUES ('m1', 'p1', 'b-explained', 'purchase', 5, 0)`,
    );

    const report = await collectDeviceDiagnostics();

    expect(report.resolution.batchesWithoutMovements).toBe(1);
  });

  it("surfaces unapplied stock deltas worst-first", async () => {
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('m-new', 'b-missing', 1, 2), ('m-old', 'b-gone', 4, 37)`,
    );

    const report = await collectDeviceDiagnostics();

    expect(report.pendingDeltas).toHaveLength(2);
    expect(report.pendingDeltas[0].movement_id).toBe("m-old");
    expect(report.pendingDeltas[0].attempts).toBe(37);
  });

  it("writes nothing to the database", async () => {
    db.run(`INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'panadol', 'c-missing', 0)`);
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('products', 'p1', 'UPDATE', '{}', '2026-10-08T10:00:00Z')`,
    );

    const before = snapshot();
    await collectDeviceDiagnostics();

    expect(snapshot()).toBe(before);
  });
});

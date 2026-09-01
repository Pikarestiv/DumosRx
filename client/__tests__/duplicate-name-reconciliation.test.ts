import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

/**
 * Regression test for a real incident: SyncController::push silently skips
 * inserting a category/supplier whose name collides with one the server
 * already has for the same owner (see its "duplicate name" handling),
 * remapping the id only in that single request's in-memory $idMap. A local
 * row created before this reconciliation runs was otherwise permanently
 * unresolvable: every retry re-attempted the same insert, got skipped
 * again, and anything referencing it by the old local id kept failing its
 * foreign key check forever. This proves pull.ts detects the same
 * collision (by name) and remaps every local reference to the server's id.
 */
describe("pull.ts duplicate-name reconciliation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pullChanges } = await import("@/lib/db/sync-engine/pull"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pullChanges: ReturnType<typeof vi.fn> };
    });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM categories; DELETE FROM products; DELETE FROM suppliers;
      DELETE FROM _sync_state; DELETE FROM _sync_queue;
    `);
    vi.clearAllMocks();
  });

  it("remaps a product's category_id when the local category name collides with the server's, and requeues it since it was already fully synced with no pending queue entry", async () => {
    db.run(`INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'Panadol', 'local-cat', 0)`);
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('local-cat', 'Analgesics', 0)`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        categories: [{ id: "server-cat", name: "Analgesics", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const product = db.exec(`SELECT category_id, _synced FROM products WHERE id = 'p1'`);
    expect(product[0].values[0][0]).toBe("server-cat");
    expect(product[0].values[0][1]).toBe(0);

    const localCat = db.exec(`SELECT _deleted FROM categories WHERE id = 'local-cat'`);
    expect(localCat[0].values[0][0]).toBe(1);

    // p1 had no _sync_queue entry at all (it was already fully synced under
    // the old id) — without requeueing, this corrected category_id would
    // never reach the server: _synced would stay 0 forever with nothing to
    // push it.
    const queued = db.exec(`SELECT operation, payload FROM _sync_queue WHERE table_name = 'products' AND record_id = 'p1'`);
    expect(queued[0].values[0][0]).toBe("INSERT");
    const payload = JSON.parse(queued[0].values[0][1] as string);
    expect(payload.category_id).toBe("server-cat");
  });

  it("rewrites a stale _sync_queue payload that still has the old category id", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('local-cat', 'Analgesics', 0)`);
    db.run(`INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'Panadol', 'local-cat', 0)`);
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES ('products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol", category_id: "local-cat" })],
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        categories: [{ id: "server-cat", name: "Analgesics", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const queued = db.exec(`SELECT payload FROM _sync_queue WHERE record_id = 'p1'`);
    const payload = JSON.parse(queued[0].values[0][0] as string);
    expect(payload.category_id).toBe("server-cat");
  });

  it("does not touch a local category whose name doesn't collide with anything the server returned", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('local-cat', 'Vitamins', 0)`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        categories: [{ id: "server-cat", name: "Analgesics", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const localCat = db.exec(`SELECT _deleted FROM categories WHERE id = 'local-cat'`);
    expect(localCat[0].values[0][0]).toBe(0);
  });

  it("remaps a supplier reference across stock_batches and purchase_orders", async () => {
    db.run(`INSERT INTO suppliers (id, name, payment_terms, _deleted) VALUES ('local-sup', 'Kingsize Pharmaceuticals', 30, 0)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, supplier_id, _deleted) VALUES ('sb1', 'p1', 10, 500, 'local-sup', 0)`);
    db.run(`INSERT INTO purchase_orders (id, supplier_id, _deleted) VALUES ('po1', 'local-sup', 0)`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        suppliers: [{ id: "server-sup", name: "Kingsize Pharmaceuticals", _version: 1 }],
      },
      server_timestamp: "2026-08-14T00:00:00Z",
    });

    await pullChanges();

    const batch = db.exec(`SELECT supplier_id FROM stock_batches WHERE id = 'sb1'`);
    expect(batch[0].values[0][0]).toBe("server-sup");

    const po = db.exec(`SELECT supplier_id FROM purchase_orders WHERE id = 'po1'`);
    expect(po[0].values[0][0]).toBe("server-sup");

    const localSup = db.exec(`SELECT _deleted FROM suppliers WHERE id = 'local-sup'`);
    expect(localSup[0].values[0][0]).toBe(1);
  });
});

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: vi.fn(),
  },
}));

const LOCAL_CAT = "11111111-1111-4111-8111-111111111111";
const SERVER_CAT = "22222222-2222-4222-8222-222222222222";

// Regression test for the sync bug reported after a bulk import:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-push-id-map-reconciliation-test-ts-L18
describe("push.ts id_map reconciliation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pushChanges: ReturnType<typeof vi.fn> };
    });

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    for (const table of ["categories", "products"]) {
      try {
        db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      } catch (error) {
        if (!String(error).includes("duplicate column")) throw error;
      }
    }
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM categories; DELETE FROM products; DELETE FROM _sync_queue;
    `);
    vi.clearAllMocks();
  });

  it("remaps the live product row and rewrites the still-queued payload when the response reports a duplicate-name skip", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES (?, 'Analgesics', 0)`, [LOCAL_CAT]);
    db.run(`INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'Panadol', ?, 0)`, [LOCAL_CAT]);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'categories', ?, 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [LOCAL_CAT, JSON.stringify({ id: LOCAL_CAT, name: "Analgesics" })],
    );
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-push-id-map-reconciliation-test-ts-L63
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (2, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:01Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol", category_id: LOCAL_CAT })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [{ id: 2, table_name: "products", record_id: "p1", reason: "Invalid category_id (not a UUID)" }],
      id_map: { categories: { [LOCAL_CAT]: SERVER_CAT } },
    });

    await pushChanges();

    const product = db.exec(`SELECT category_id FROM products WHERE id = 'p1'`);
    expect(product[0].values[0][0]).toBe(SERVER_CAT);

    const localCat = db.exec(`SELECT _deleted FROM categories WHERE id = ?`, [LOCAL_CAT]);
    expect(localCat[0].values[0][0]).toBe(1);

    const queued = db.exec(`SELECT payload FROM _sync_queue WHERE id = 2`);
    const payload = JSON.parse(queued[0].values[0][0] as string);
    expect(payload.category_id).toBe(SERVER_CAT);
  });

  it("remaps a still-pending _sync_queue row's own record_id, not just other rows' payload content, when its record is the one merged away", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES (?, 'Analgesics', 0)`, [LOCAL_CAT]);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'categories', ?, 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [LOCAL_CAT, JSON.stringify({ id: LOCAL_CAT, name: "Analgesics" })],
    );
    // A second, still-pending edit to the SAME (now duplicate) category — e.g.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-push-id-map-reconciliation-test-ts-L99
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at, next_retry_at) VALUES (3, 'categories', ?, 'UPDATE', ?, '2026-08-01T00:00:02Z', '2099-01-01T00:00:00Z')`,
      [LOCAL_CAT, JSON.stringify({ id: LOCAL_CAT, name: "Analgesics (renamed)", _version: 1 })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
      id_map: { categories: { [LOCAL_CAT]: SERVER_CAT } },
    });

    await pushChanges();

    const queued = db.exec(`SELECT record_id, payload FROM _sync_queue WHERE id = 3`);
    expect(queued[0].values[0][0]).toBe(SERVER_CAT);
    const payload = JSON.parse(queued[0].values[0][1] as string);
    expect(payload.id).toBe(SERVER_CAT);
  });

  it("remaps every store's products off a merged NULL-store category, leaving the cross-store pointer for the server's guard to re-own (A-303)", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'A'), ('store-b', 'B')`);
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES (?, 'Analgesics', 0)`, [LOCAL_CAT]);
    db.run(`INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES ('p-a', 'Panadol', ?, 'store-a', 0)`, [LOCAL_CAT]);
    db.run(`INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES ('p-b', 'Coartem', ?, 'store-b', 0)`, [LOCAL_CAT]);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'categories', ?, 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [LOCAL_CAT, JSON.stringify({ id: LOCAL_CAT, name: "Analgesics" })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
      id_map: { categories: { [LOCAL_CAT]: SERVER_CAT } },
    });

    core.setActiveStoreId("store-a");
    try {
      await pushChanges();

      const products = db.exec(`SELECT category_id FROM products ORDER BY id`);
      expect(products[0].values.map((row) => row[0])).toEqual([SERVER_CAT, SERVER_CAT]);
      const requeued = db.exec(`SELECT record_id FROM _sync_queue WHERE table_name = 'products' ORDER BY record_id`);
      expect(requeued[0].values.map((row) => row[0])).toEqual(["p-a", "p-b"]);
    } finally {
      core.setActiveStoreId(null);
      db.run(`DELETE FROM stores`);
    }
  });

  it("does nothing when the response has no id_map", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES (?, 'Analgesics', 0)`, [LOCAL_CAT]);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'categories', ?, 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [LOCAL_CAT, JSON.stringify({ id: LOCAL_CAT, name: "Analgesics" })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 1, failed: [] });

    await pushChanges();

    const localCat = db.exec(`SELECT _deleted FROM categories WHERE id = ?`, [LOCAL_CAT]);
    expect(localCat[0].values[0][0]).toBe(0);
  });
});

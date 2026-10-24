import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

// Regression test for a real incident:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-duplicate-name-reconciliation-test-ts-L15
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
    // store_id arrives by runtime migration, not SCHEMA_SQL.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-duplicate-name-reconciliation-test-ts-L45
    for (const table of ["categories", "products", "suppliers"]) {
      try {
        db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      } catch {
        // Column already present in this schema version.
      }
    }
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM categories; DELETE FROM products; DELETE FROM suppliers;
      DELETE FROM _sync_state; DELETE FROM _sync_queue;
    `);
    vi.clearAllMocks();
  });

  // Runs even when an assertion fails, so a leaked resolver cannot change what
  // a later test in this file exercises.
  afterEach(() => {
    core.setActiveStoreId(null);
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

    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-duplicate-name-reconciliation-test-ts-L83
    const queued = db.exec(`SELECT operation, payload FROM _sync_queue WHERE table_name = 'products' AND record_id = 'p1'`);
    expect(queued[0].values[0][0]).toBe("INSERT");
    const payload = JSON.parse(queued[0].values[0][1] as string);
    expect(payload.category_id).toBe("server-cat");
  });

  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-duplicate-name-reconciliation-test-ts-L93
  it("leaves another store's products and categories alone while reconciling the active store's", async () => {
    core.setActiveStoreId("store-a");
    db.run(`INSERT INTO categories (id, name, store_id, _deleted) VALUES ('cat-a', 'Drugs', 'store-a', 0)`);
    db.run(`INSERT INTO categories (id, name, store_id, _deleted) VALUES ('cat-b', 'Drugs', 'store-b', 0)`);
    db.run(`INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES ('p-a', 'Panadol', 'cat-a', 'store-a', 0)`);
    db.run(`INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES ('p-b', 'Coartem', 'cat-b', 'store-b', 0)`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        categories: [{ id: "server-cat-a", name: "Drugs", store_id: "store-a", _version: 1 }],
      },
      server_timestamp: "2026-10-19T00:00:00Z",
    });

    await pullChanges();

    // The active store's own collision still reconciles.
    const ownProduct = db.exec(`SELECT category_id FROM products WHERE id = 'p-a'`);
    expect(ownProduct[0].values[0][0]).toBe("server-cat-a");

    // The other store's product keeps its own category...
    const otherProduct = db.exec(`SELECT category_id FROM products WHERE id = 'p-b'`);
    expect(otherProduct[0].values[0][0]).toBe("cat-b");

    // ...and that category is still there to resolve it.
    const otherCategory = db.exec(`SELECT _deleted FROM categories WHERE id = 'cat-b'`);
    expect(otherCategory[0].values[0][0]).toBe(0);
  });

  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-duplicate-name-reconciliation-test-ts-L133
  it("touches nothing when the pulled page belongs to a different store than the one now active", async () => {
    core.setActiveStoreId("store-b");
    db.run(`INSERT INTO categories (id, name, store_id, _deleted) VALUES ('cat-b', 'Drugs', 'store-b', 0)`);
    db.run(`INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES ('p-b', 'Coartem', 'cat-b', 'store-b', 0)`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        categories: [{ id: "server-cat-a", name: "Drugs", store_id: "store-a", _version: 1 }],
      },
      server_timestamp: "2026-10-19T00:00:00Z",
    });

    await pullChanges();

    const product = db.exec(`SELECT category_id FROM products WHERE id = 'p-b'`);
    expect(product[0].values[0][0]).toBe("cat-b");

    const category = db.exec(`SELECT _deleted FROM categories WHERE id = 'cat-b'`);
    expect(category[0].values[0][0]).toBe(0);
  });

  async function pullUnscopedPageOverLegacyCategory(storeIds: string[]): Promise<unknown[]> {
    for (const id of storeIds) db.run(`INSERT INTO stores (id, name) VALUES (?, ?)`, [id, id]);
    db.run(`INSERT INTO categories (id, name, store_id, _deleted) VALUES ('legacy-cat', 'Analgesics', NULL, 0)`);
    db.run(`INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES ('p-a', 'Panadol', 'legacy-cat', 'store-a', 0)`);
    db.run(`INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES ('p-b', 'Coartem', 'legacy-cat', 'store-b', 0)`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        categories: [{ id: "server-legacy-cat", name: "Analgesics", store_id: null, _version: 1 }],
      },
      server_timestamp: "2026-10-23T00:00:00Z",
    });

    try {
      await pullChanges();
      return db.exec(`SELECT category_id FROM products ORDER BY id`)[0].values.map((row) => row[0]);
    } finally {
      db.run(`DELETE FROM stores`);
    }
  }

  it("does not fold a NULL-store category on a two-store device, even from a page that carries one (A-303)", async () => {
    expect(await pullUnscopedPageOverLegacyCategory(["store-a", "store-b"])).toEqual(["legacy-cat", "legacy-cat"]);
    const legacy = db.exec(`SELECT _deleted FROM categories WHERE id = 'legacy-cat'`);
    expect(legacy[0].values[0][0]).toBe(0);
  });

  it("still folds a NULL-store category on a single-store device, the case the legacy fold exists for", async () => {
    expect(await pullUnscopedPageOverLegacyCategory(["store-a"])).toEqual(["server-legacy-cat", "server-legacy-cat"]);
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

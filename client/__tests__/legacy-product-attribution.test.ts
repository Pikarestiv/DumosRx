import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: vi.fn(),
  },
}));

describe("legacy product attribution before push (A-248)", () => {
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
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    for (const table of ["products", "stock_batches", "stock_movements"]) {
      try {
        db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      } catch (error) {
        if (!String(error).includes("duplicate column")) throw error;
      }
    }
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM _sync_queue; DELETE FROM stores;`);
    vi.clearAllMocks();
    apiClient.pushChanges.mockResolvedValue({ success: true, processed: 1, failed: [] });
  });

  function seedLegacyProduct(id: string, batchStores: string[], queued = true) {
    db.run(`INSERT INTO products (id, name, store_id, _deleted) VALUES (?, 'Legacy', NULL, 0)`, [id]);
    batchStores.forEach((storeId, i) => {
      db.run(`INSERT INTO stock_batches (id, product_id, store_id, quantity, _deleted) VALUES (?, ?, ?, 1, 0)`, [`${id}-b${i}`, id, storeId]);
    });
    if (!queued) return;
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES ('products', ?, 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [id, JSON.stringify({ id, name: "Legacy" })],
    );
  }

  function localStore(id: string): unknown {
    return db.exec(`SELECT store_id FROM products WHERE id = ?`, [id])[0].values[0][0];
  }

  function sentProductPayload(id: string): Record<string, unknown> | undefined {
    const changes = apiClient.pushChanges.mock.calls.flatMap((call) => (call[0]?.changes ?? []) as { record_id: string; table_name: string; payload: Record<string, unknown> }[]);
    return changes.find((c) => c.table_name === "products" && c.record_id === id)?.payload;
  }

  it("attributes a store-less product whose batches all name one store, locally and in the payload it pushes", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'A'), ('store-b', 'B')`);
    seedLegacyProduct("p1", ["store-a", "store-a"]);

    await pushChanges();

    expect(localStore("p1")).toBe("store-a");
    expect(sentProductPayload("p1")?.store_id).toBe("store-a");
  });

  it("leaves a store-less product alone when its evidence names two stores", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'A'), ('store-b', 'B')`);
    seedLegacyProduct("p2", ["store-a", "store-b"]);

    await pushChanges();

    expect(localStore("p2")).toBeNull();
    expect(sentProductPayload("p2")?.store_id).toBeUndefined();
  });

  it("does nothing on a single-store device, where the legacy backfill already owns this", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'A')`);
    seedLegacyProduct("p3", ["store-a"]);

    await pushChanges();

    expect(localStore("p3")).toBeNull();
  });

  it("leaves a store-less product with no pending INSERT alone, so the device never diverges from what it pushed", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'A'), ('store-b', 'B')`);
    seedLegacyProduct("p4", ["store-a"], false);

    await pushChanges();

    expect(localStore("p4")).toBeNull();
  });
});

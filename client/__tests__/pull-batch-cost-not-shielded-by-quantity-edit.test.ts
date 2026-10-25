import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
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

describe("a pending quantity-only batch edit does not shield the batch from the pull (A-271)", () => {
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
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM products;`);
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('prod-1', 'Gluformin', 0)`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, _version)
       VALUES ('batch-1', 'prod-1', 'Opening Stock', 6, 50, 1, 0, 3)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted)
       VALUES ('m-in', 'prod-1', 'batch-1', 'purchase', 10, 0), ('m-out', 'prod-1', 'batch-1', 'sale', -4, 0)`,
    );
    vi.clearAllMocks();
  });

  function queue(payload: Record<string, unknown>, operation = "UPDATE") {
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES ('stock_batches', 'batch-1', ?, ?, '2026-10-25T00:00:00Z')`,
      [operation, JSON.stringify(payload)],
    );
  }

  function pullCost(cost: number) {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_batches: [
          { id: "batch-1", product_id: "prod-1", batch_number: "Opening Stock", cost_price: cost, quantity: 0, is_active: true, _version: 4 },
        ],
      },
      has_more: { stock_batches: false },
      server_timestamp: "2026-10-25T01:00:00Z",
    });
  }

  const row = () => db.exec(`SELECT cost_price, quantity FROM stock_batches WHERE id = 'batch-1'`)[0].values[0];

  it("takes another device's cost while this till's sale is still queued, and keeps its own quantity", async () => {
    queue({ id: "batch-1", quantity: 6, updated_at: "2026-10-25T00:00:00Z", _version: 3, _synced: 0 });
    pullCost(75);

    await pullChanges();

    expect(row()).toEqual([75, 6]);
  });

  it("still shields a batch whose own cost edit is unpushed", async () => {
    queue({ id: "batch-1", cost_price: 60, updated_at: "2026-10-25T00:00:00Z", _version: 3, _synced: 0 });
    pullCost(75);

    await pullChanges();

    expect(row()[0]).toBe(50);
  });

  it("still shields a batch with a quantity edit beside a cost edit", async () => {
    queue({ id: "batch-1", quantity: 6, updated_at: "2026-10-25T00:00:00Z", _version: 3, _synced: 0 });
    queue({ id: "batch-1", cost_price: 60, updated_at: "2026-10-25T00:00:01Z", _version: 3, _synced: 0 });
    pullCost(75);

    await pullChanges();

    expect(row()[0]).toBe(50);
  });

  it("still shields a batch whose quantity edit also claims a store, which the pull could overwrite", async () => {
    queue({ id: "batch-1", quantity: 6, store_id: "store-a", updated_at: "2026-10-25T00:00:00Z", _version: 3, _synced: 0 });
    pullCost(75);

    await pullChanges();

    expect(row()[0]).toBe(50);
  });

  it("still shields a batch with an unpushed INSERT", async () => {
    queue({ id: "batch-1", quantity: 6 }, "INSERT");
    pullCost(75);

    await pullChanges();

    expect(row()[0]).toBe(50);
  });
});

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

// Regression test for a real, at-scale reproduction:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-stock-batches-quantity-not-trusted-test-ts-L15
describe("pullChanges never trusts a pulled stock_batches.quantity snapshot", () => {
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
    db.run(
      `DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM products;`,
    );
    db.run(
      `INSERT INTO products (id, name, _deleted) VALUES ('prod-1', 'Test Widget', 0)`,
    );
    vi.clearAllMocks();
  });

  it("keeps the local quantity when an UPDATE for an existing batch pulls a stale (lower) snapshot", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted, _version)
       VALUES ('batch-1', 'prod-1', 'Opening Stock', 20, 1, 0, 1)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        // Server's own copy hasn't processed this batch's movement yet —
        // still genuinely 0 there, per its own documented design.
        stock_batches: [
          {
            id: "batch-1",
            product_id: "prod-1",
            batch_number: "Opening Stock",
            quantity: 0,
            is_active: true,
            _version: 2,
          },
        ],
      },
      server_timestamp: "2026-09-19T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batch-1'`);
    expect(rows[0].values[0][0]).toBe(20);
  });

  it("applies a newly-pulled stock_movements row's delta to the batch it references, even when the batch is also new in the same pull", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        // Deliberately listed movements before batches to prove the fix
        // doesn't depend on incidental response ordering.
        stock_movements: [
          {
            id: "move-1",
            product_id: "prod-1",
            stock_batch_id: "batch-2",
            movement_type: "purchase",
            quantity: 15,
            _version: 1,
          },
        ],
        stock_batches: [
          {
            id: "batch-2",
            product_id: "prod-1",
            batch_number: "Opening Stock",
            quantity: 0,
            is_active: true,
            _version: 1,
          },
        ],
      },
      server_timestamp: "2026-09-19T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batch-2'`);
    expect(rows[0].values[0][0]).toBe(15);
  });

  it("does not double-apply a movement's delta if it's somehow re-offered on a later pull (already exists locally)", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted, _version)
       VALUES ('batch-3', 'prod-1', 'Opening Stock', 15, 1, 0, 1)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted, _version)
       VALUES ('move-2', 'prod-1', 'batch-3', 'purchase', 15, 0, 1)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_movements: [
          {
            id: "move-2",
            product_id: "prod-1",
            stock_batch_id: "batch-3",
            movement_type: "purchase",
            quantity: 15,
            _version: 1,
          },
        ],
      },
      server_timestamp: "2026-09-19T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batch-3'`);
    expect(rows[0].values[0][0]).toBe(15);
  });

  it("floors a batch's quantity at 0 when a pulled movement's delta would take it negative, mirroring the local oversell floor", async () => {
    // Another device sold 5 from a batch that only had 2 left there — its own local write floors at 0 (see deductFromBatch() i…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-pull-stock-batches-quantity-not-trusted-test-ts-L165
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted, _version)
       VALUES ('batch-4', 'prod-1', 'Oversold Batch', 2, 1, 0, 1)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_movements: [
          {
            id: "move-3",
            product_id: "prod-1",
            stock_batch_id: "batch-4",
            movement_type: "sale",
            quantity: -5,
            _version: 1,
          },
        ],
      },
      server_timestamp: "2026-09-19T00:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batch-4'`);
    expect(rows[0].values[0][0]).toBe(0);
  });
});

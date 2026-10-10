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
 * Regression test for docs/FIXED_BUGS.md A-54: a pulled stock_movements row
 * whose stock_batches row hadn't arrived yet had its delta parked in an
 * in-memory array, while the movement row itself committed with its own
 * page's transaction. A later page failing in the same round discarded the
 * array, and the next pull took the UPDATE branch (the movement now exists
 * locally), which applies no delta at all — so the batch's on-hand quantity
 * was permanently understated. The deferral is now persisted in the same
 * transaction as the movement row and drained on every later pull.
 */
describe("pullChanges recovers a deferred stock delta after a failed pull round", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  const batchQuantity = (id: string): number | null => {
    const res = db.exec(`SELECT quantity FROM stock_batches WHERE id = '${id}'`);
    if (!res.length) return null;
    return res[0].values[0][0] as number;
  };

  const pendingDeltaCount = (): number => {
    const res = db.exec(`SELECT COUNT(*) FROM _pending_stock_deltas`);
    return res[0].values[0][0] as number;
  };

  const movement = (id: string, batchId: string, quantity: number) => ({
    id,
    product_id: "prod-1",
    stock_batch_id: batchId,
    movement_type: "purchase",
    quantity,
    updated_at: "2026-09-01T00:00:00.000000Z",
    _version: 1,
  });

  const batch = (id: string) => ({
    id,
    product_id: "prod-1",
    batch_number: "Opening Stock",
    quantity: 0,
    is_active: true,
    updated_at: "2026-09-02T00:00:00.000000Z",
    _version: 1,
  });

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
      `DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM _pending_stock_deltas;
       DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM products;`,
    );
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('prod-1', 'Test Widget', 0)`);
    vi.clearAllMocks();
  });

  it("applies the delta on the next pull after the round carrying it failed on a later page", async () => {
    apiClient.pullChanges
      .mockResolvedValueOnce({
        success: true,
        changes: { stock_movements: [movement("move-1", "batch-9", 15)] },
        server_timestamp: "2026-09-03T00:00:00Z",
        has_more: { stock_movements: true },
      })
      .mockRejectedValueOnce(new Error("Network request failed"));

    await expect(pullChanges()).rejects.toThrow("Network request failed");

    expect(batchQuantity("batch-9")).toBeNull();
    expect(pendingDeltaCount()).toBe(1);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_batches: [batch("batch-9")],
        stock_movements: [movement("move-1", "batch-9", 15)],
      },
      server_timestamp: "2026-09-04T00:00:00Z",
    });

    await pullChanges();

    expect(batchQuantity("batch-9")).toBe(15);
    expect(pendingDeltaCount()).toBe(0);
  });

  it("applies a deferred delta exactly once when the batch arrives in the same round", async () => {
    apiClient.pullChanges
      .mockResolvedValueOnce({
        success: true,
        changes: { stock_movements: [movement("move-2", "batch-10", 7)] },
        server_timestamp: "2026-09-03T00:00:00Z",
        has_more: { stock_movements: true },
      })
      .mockResolvedValueOnce({
        success: true,
        changes: { stock_batches: [batch("batch-10")] },
        server_timestamp: "2026-09-03T00:00:00Z",
      });

    await pullChanges();

    expect(batchQuantity("batch-10")).toBe(7);
    expect(pendingDeltaCount()).toBe(0);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { stock_movements: [movement("move-2", "batch-10", 7)] },
      server_timestamp: "2026-09-05T00:00:00Z",
    });

    await pullChanges();

    expect(batchQuantity("batch-10")).toBe(7);
  });

  it("keeps a deferral whose batch never arrives instead of silently dropping it", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { stock_movements: [movement("move-3", "batch-missing", 4)] },
      server_timestamp: "2026-09-03T00:00:00Z",
    });

    await pullChanges();

    expect(pendingDeltaCount()).toBe(1);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { stock_batches: [batch("batch-missing")] },
      server_timestamp: "2026-09-06T00:00:00Z",
    });

    await pullChanges();

    expect(batchQuantity("batch-missing")).toBe(4);
    expect(pendingDeltaCount()).toBe(0);
  });

  /**
   * A-176: a batch whose `updated_at` predates the device's pull cursor is
   * never re-sent, so its deferred delta can never resolve. Rewinding the
   * `stock_batches` window makes the server re-offer it, which is the same
   * machinery the operator's manual "Force full resync" relies on, scoped to
   * the one table that can settle the delta.
   */
  it("rewinds the stock_batches pull window once a deferral has gone chronic", async () => {
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES
         ('stock_batches', '2026-10-01T00:00:00Z'), ('products', '2026-10-01T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('move-chronic', 'batch-stranded', 12, 9)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, stock_batch_id, product_id, quantity, movement_type, _deleted)
       VALUES ('move-chronic', 'batch-stranded', 'prod-1', 12, 'purchase', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { products: [] },
      server_timestamp: "2026-10-02T00:00:00Z",
      has_more: {},
    });

    await pullChanges();

    // The row survives with a null window so A-218's budget can restore the
    // baseline; pullChanges reads a null stamp as "from timestamp zero".
    expect(
      db.exec(`SELECT last_synced_at FROM _sync_state WHERE table_name = 'stock_batches'`)[0]
        .values[0][0],
    ).toBeNull();
    // Only the table that can settle the delta is re-pulled.
    expect(
      db.exec(`SELECT last_synced_at FROM _sync_state WHERE table_name = 'products'`)[0]
        .values[0][0],
    ).not.toBeNull();
  });

  it("does not rewind while a deferral is young enough to settle on its own", async () => {
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('stock_batches', '2026-10-01T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('move-young', 'batch-soon', 12, 1)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, stock_batch_id, product_id, quantity, movement_type, _deleted)
       VALUES ('move-young', 'batch-soon', 'prod-1', 12, 'purchase', 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { products: [] },
      server_timestamp: "2026-10-02T00:00:00Z",
      has_more: {},
    });

    await pullChanges();

    expect(
      db.exec(`SELECT last_synced_at FROM _sync_state WHERE table_name = 'stock_batches'`).length,
    ).toBe(1);
  });

  it("discards a deferral whose movement has since been soft-deleted by the server", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { stock_movements: [movement("move-4", "batch-11", 9)] },
      server_timestamp: "2026-09-03T00:00:00Z",
    });

    await pullChanges();
    expect(pendingDeltaCount()).toBe(1);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_batches: [batch("batch-11")],
        stock_movements: [{ ...movement("move-4", "batch-11", 9), _deleted: true }],
      },
      server_timestamp: "2026-09-07T00:00:00Z",
    });

    await pullChanges();

    expect(batchQuantity("batch-11")).toBe(0);
    expect(pendingDeltaCount()).toBe(0);
  });
});

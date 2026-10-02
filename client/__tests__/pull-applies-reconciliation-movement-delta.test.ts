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
 * A-148: a 'sync_reconciliation' movement is applied like any other
 * movement on pull - there is no movement_type special-case in pull.ts.
 * What actually prevents the reporting device from double-applying its own
 * correction is that reconcile-quantities.ts inserts that device's copy of
 * the row locally, as already-synced, before the server's echo is ever
 * pulled - so that device's pull hits the UPDATE branch (which never
 * replays a delta for any movement type), while every other device of the
 * same store - which never had the row - hits the INSERT branch and
 * correctly applies the delta. See client/AGENTS.md, "Stock quantity
 * reconciliation": the earlier design that skipped the delta by
 * movement_type for every device left every device except the reporter
 * uncorrected, which this test guards against regressing to.
 */
describe("pullChanges applies a sync_reconciliation movement exactly like an ordinary one", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  const batchQuantity = (id: string): number | null => {
    const res = db.exec(`SELECT quantity FROM stock_batches WHERE id = '${id}'`);
    if (!res.length) return null;
    return res[0].values[0][0] as number;
  };

  const pendingDeltaCount = (): number =>
    db.exec(`SELECT COUNT(*) FROM _pending_stock_deltas`)[0].values[0][0] as number;

  const movement = (id: string, movementType: string, quantity: number) => ({
    id,
    product_id: "prod-1",
    stock_batch_id: "batch-1",
    movement_type: movementType,
    quantity,
    updated_at: "2026-10-01T00:00:00.000000Z",
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
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, _deleted)
       VALUES ('batch-1', 'prod-1', 500, 0)`,
    );
    vi.clearAllMocks();
  });

  it("a device that never saw this movement before applies its delta on pull, like any other device of the same store", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_movements: [movement("move-recon", "sync_reconciliation", 300)],
      },
      server_timestamp: "2026-10-02T00:00:00Z",
    });

    await pullChanges();

    expect(batchQuantity("batch-1")).toBe(800);
    const stored = db.exec(
      `SELECT movement_type FROM stock_movements WHERE id = 'move-recon'`,
    );
    expect(stored[0].values[0][0]).toBe("sync_reconciliation");
  });

  it("a device that already has the row locally (the reporting device) does not re-apply its delta on pull", async () => {
    // Simulates reconcile-quantities.ts's local insert, already-synced,
    // made before this device's own pull of the server's echo ever runs.
    db.run(
      `INSERT INTO stock_movements
         (id, stock_batch_id, product_id, movement_type, quantity, _version, _synced, _deleted)
       VALUES ('move-recon', 'batch-1', 'prod-1', 'sync_reconciliation', 300, 1, 1, 0)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_movements: [movement("move-recon", "sync_reconciliation", 300)],
      },
      server_timestamp: "2026-10-02T00:00:00Z",
    });

    await pullChanges();

    expect(batchQuantity("batch-1")).toBe(500);
  });

  it("parks a deferral for a reconciliation movement whose batch is absent, like any other movement type", async () => {
    db.run(`DELETE FROM stock_batches`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stock_movements: [movement("move-recon-2", "sync_reconciliation", 42)],
      },
      server_timestamp: "2026-10-02T00:00:00Z",
    });

    await pullChanges();

    expect(pendingDeltaCount()).toBe(1);
  });

  it("still replays an ordinary movement's delta", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { stock_movements: [movement("move-sale", "sale", -20)] },
      server_timestamp: "2026-10-02T00:00:00Z",
    });

    await pullChanges();

    expect(batchQuantity("batch-1")).toBe(480);
  });
});

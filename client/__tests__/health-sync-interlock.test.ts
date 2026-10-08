import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const reconcileApi = vi.fn(async () => ({ reconciled: 0, checked: 0, movements: [] }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    reconcileStockQuantities: (...args: unknown[]) => reconcileApi(...(args as [])),
  },
}));

/**
 * Health Sync asserts THIS device's quantities as authoritative and makes the
 * server adopt them, recording each correction as a permanent
 * sync_reconciliation movement. Run on a diverged device it overwrites correct
 * cloud data with wrong numbers — on the A-191 store that would have pushed
 * 83,990 units over a true 47,072.
 *
 * The interlock deliberately keys on divergence ONLY, not on pending deferred
 * deltas. A pending-delta guard was tried and removed in review — see
 * docs/FIXED_BUGS.md A-173 and
 * client/__tests__/reconcile-refuses-with-pending-deltas.test.ts, which pins
 * the opposite property: the repair must still run while a delta is pending.
 */
describe("Health Sync interlock", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let reconcileStockQuantities: typeof import("@/lib/db/sync-engine/reconcile-quantities").reconcileStockQuantities;
  const syncOk = vi.fn(async () => ({ success: true, pushed: 0, pulled: 0 }));

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ reconcileStockQuantities } = await import("@/lib/db/sync-engine/reconcile-quantities"));

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
      `DELETE FROM stock_movements; DELETE FROM stock_batches;
       DELETE FROM _pending_stock_deltas; DELETE FROM _sync_queue;`,
    );
    vi.clearAllMocks();
  });

  function soundBatch() {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted)
       VALUES ('b1', 'p1', 'Opening Stock', 5, 1, 0)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted)
       VALUES ('m1', 'p1', 'b1', 'purchase', 5, 0)`,
    );
  }

  it("still proceeds while this device has an unapplied stock delta, whose batch is absent by construction", async () => {
    soundBatch();
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('m-stranded', 'b-missing', 4, 12)`,
    );

    await reconcileStockQuantities(syncOk);

    expect(reconcileApi).toHaveBeenCalled();
    const [payload] = reconcileApi.mock.calls[0] as unknown as [
      { batches: Array<{ id: string }> },
    ];
    expect(payload.batches.map((b) => b.id)).not.toContain("b-missing");
  });

  it("refuses when a batch disagrees with its own movement log", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted)
       VALUES ('b1', 'p1', 'Opening Stock', 10, 1, 0)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted)
       VALUES ('m1', 'p1', 'b1', 'purchase', 5, 0)`,
    );

    await expect(reconcileStockQuantities(syncOk)).rejects.toThrow(
      /does not match its own movement history/i,
    );
    expect(reconcileApi).not.toHaveBeenCalled();
  });

  it("proceeds on a sound device", async () => {
    soundBatch();

    await reconcileStockQuantities(syncOk);

    expect(syncOk).toHaveBeenCalledWith(true);
    expect(reconcileApi).toHaveBeenCalled();
  });

  it("does not block on an unreconstructable batch, which it exists to repair", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, _deleted)
       VALUES ('b1', 'p1', 'Opening Stock', 40, 1, 0)`,
    );

    await reconcileStockQuantities(syncOk);

    expect(reconcileApi).toHaveBeenCalled();
  });
});

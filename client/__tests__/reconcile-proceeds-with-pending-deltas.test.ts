import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const reconcileMock = vi.fn(async (..._args: unknown[]) => ({
  reconciled: 0,
  checked: 0,
  movements: [],
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    reconcileStockQuantities: (...args: unknown[]) => reconcileMock(...args),
  },
}));

/**
 * A-173, corrected in review. An earlier version of this file asserted that
 * "Health Sync" must REFUSE while deferred deltas are pending, on the theory
 * that the device would otherwise assert understated quantities over the
 * server's correct ones.
 *
 * That theory was wrong, and the guard it justified was removed. A delta is
 * pending only while its `stock_batches` row is ABSENT locally — that is the
 * condition that defers it. An absent batch is not in the payload this
 * function sends, and the server only touches batches that are in the
 * payload. So the understated write cannot happen, and the guard refused
 * repairs while protecting nothing — permanently, for any device whose pull
 * scoping means the batch never arrives.
 *
 * These tests pin the real safety property instead: a batch with an unapplied
 * delta is excluded from the payload by construction.
 */
describe("reconcileStockQuantities with pending deltas", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let reconcile: typeof import("@/lib/db/sync-engine/reconcile-quantities").reconcileStockQuantities;

  const okSync = vi.fn(async () => ({ success: true }) as never);

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ reconcileStockQuantities: reconcile } = await import(
      "@/lib/db/sync-engine/reconcile-quantities"
    ));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM _pending_stock_deltas; DELETE FROM stock_batches;`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, batch_number, _deleted)
       VALUES ('b1', 'p1', 40, 'B1', 0)`,
    );
    reconcileMock.mockClear();
    okSync.mockClear();
  });

  it("still repairs while a delta is pending, because the delta's batch is not in the payload", async () => {
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('m1', 'b-missing', 7, 12)`,
    );

    await expect(reconcile(okSync)).resolves.toBeDefined();
    expect(reconcileMock).toHaveBeenCalled();

    const [payload] = reconcileMock.mock.calls[0] as [{ batches: Array<{ id: string }> }];
    const ids = payload.batches.map((b) => b.id);

    expect(ids).toContain("b1");
    expect(ids).not.toContain("b-missing");
  });

  it("reconciles normally when nothing is pending", async () => {
    const result = await reconcile(okSync);

    expect(okSync).toHaveBeenCalled();
    expect(reconcileMock).toHaveBeenCalled();
    expect(result.checked).toBe(0);
  });

  /** The forced push+pull remains the real safeguard and must still run first. */
  it("refuses if the forced sync fails", async () => {
    const failingSync = vi.fn(async () => ({ success: false, error: "offline" }) as never);

    await expect(reconcile(failingSync)).rejects.toThrow(/offline/i);
    expect(reconcileMock).not.toHaveBeenCalled();
  });
});

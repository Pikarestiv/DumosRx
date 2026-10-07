import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const reconcileMock = vi.fn(async (..._args: unknown[]) => ({ reconciled: 0, checked: 0, movements: [] }));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    reconcileStockQuantities: (...args: unknown[]) => reconcileMock(...args),
  },
}));

/**
 * The corruption path behind A-173, and the reason the "Health Sync" repair
 * needs a guard it did not have.
 *
 * `reconcileStockQuantities()` asserts THIS device's quantities as
 * authoritative. Its existing safeguard is a forced push+pull first — but a
 * forced sync does not settle a deferred delta whose batch never arrives, so
 * the sync succeeds while the device's quantity for that batch is still
 * understated. Reconciling then writes that understated number over the
 * server's correct, movement-derived value.
 *
 * The device can detect this precisely: `_pending_stock_deltas` is non-empty.
 * Knowingly asserting authority while holding unapplied deltas is the one
 * case of the documented "stale device" risk that is not a judgement call.
 */
describe("reconcileStockQuantities refuses while deltas are pending", () => {
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

  it("refuses, and never posts, while a deferred delta is unapplied", async () => {
    db.run(
      `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
       VALUES ('m1', 'b-missing', 7, 12)`,
    );

    await expect(reconcile(okSync)).rejects.toThrow(/pending|unapplied|incomplete/i);
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  /** The forced sync still runs first; the guard is checked after it. */
  it("still reconciles normally when nothing is pending", async () => {
    const result = await reconcile(okSync);

    expect(okSync).toHaveBeenCalled();
    expect(reconcileMock).toHaveBeenCalled();
    expect(result.checked).toBe(0);
  });
});

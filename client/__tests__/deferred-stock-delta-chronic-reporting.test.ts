import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-173. The open question was whether an unresolved deferred delta is
 * retried or dropped. It is **retried and never dropped** — the row stays in
 * `_pending_stock_deltas` until its batch arrives, so on-hand stock is
 * incomplete, never silently wrong.
 *
 * The real defect is the reporting. `attempts === REPORT_AFTER_ATTEMPTS` is a
 * strict equality, so a delta reports exactly once, on its tenth attempt, and
 * is then silent forever. A permanently unresolvable delta — a batch older
 * than the pull cursor never arrives again — therefore looks like a
 * transient blip that resolved itself, which is the opposite of the truth.
 */
describe("deferred stock delta chronic reporting", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let deltas: typeof import("@/lib/db/sync-engine/deferred-stock-deltas");

  const attemptsOf = (movementId: string): number => {
    const res = db.exec(
      `SELECT attempts FROM _pending_stock_deltas WHERE movement_id = '${movementId}'`,
    );
    return res.length ? (res[0].values[0][0] as number) : -1;
  };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    deltas = await import("@/lib/db/sync-engine/deferred-stock-deltas");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM _pending_stock_deltas; DELETE FROM stock_movements; DELETE FROM stock_batches;`);
  });

  const deferFor = async (movementId: string) => {
    db.run(
      `INSERT INTO stock_movements (id, stock_batch_id, product_id, movement_type, quantity, _deleted)
       VALUES ('${movementId}', 'missing-batch', 'p1', 'purchase', 5, 0)`,
    );
    await deltas.recordDeferredStockDelta(movementId, "missing-batch", 5);
  };

  /** The delta must survive: only a batch arriving can settle it. */
  it("keeps an unresolvable delta pending rather than discarding it", async () => {
    await deferFor("m1");

    for (let i = 0; i < 12; i++) {
      await deltas.applyDeferredStockDeltas();
    }

    expect(attemptsOf("m1")).toBe(12);
  });

  /**
   * The defect: a condition that never resolves must not go quiet. Silence
   * after one report is indistinguishable from the problem having been fixed.
   */
  it("keeps reporting a delta that stays unresolvable, not just once", async () => {
    await deferFor("m2");

    const reportedAt: number[] = [];

    for (let i = 1; i <= 60; i++) {
      const unresolved = await deltas.applyDeferredStockDeltas();
      if (unresolved.some((d) => d.movement_id === "m2")) {
        reportedAt.push(i);
      }
    }

    expect(reportedAt.length).toBeGreaterThan(1);
    expect(reportedAt[0]).toBe(10);
  });

  /** It must not report on every single pull either, or it becomes noise. */
  it("does not report on every attempt", async () => {
    await deferFor("m3");

    let reports = 0;

    for (let i = 1; i <= 60; i++) {
      const unresolved = await deltas.applyDeferredStockDeltas();
      if (unresolved.some((d) => d.movement_id === "m3")) {
        reports++;
      }
    }

    expect(reports).toBeLessThan(10);
  });

  /** A batch arriving still settles it immediately, at any attempt count. */
  it("applies the delta as soon as the batch finally arrives", async () => {
    await deferFor("m4");

    for (let i = 0; i < 15; i++) {
      await deltas.applyDeferredStockDeltas();
    }

    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, batch_number)
       VALUES ('missing-batch', 'p1', 100, 'B1')`,
    );

    await deltas.applyDeferredStockDeltas();

    const res = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'missing-batch'`);
    expect(res[0].values[0][0]).toBe(105);
    expect(attemptsOf("m4")).toBe(-1);
  });
});

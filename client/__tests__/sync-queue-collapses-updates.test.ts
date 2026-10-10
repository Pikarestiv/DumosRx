import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * A-203: every `update()` appended a `_sync_queue` row, so a pass over the
 * whole catalogue queued one row per product. The queue is FIFO, which
 * delays every sale rung behind it, and `pull.ts` skips any row with a
 * queued local edit — so the backlog also blocks incoming server changes to
 * those same rows. An UPDATE now collapses onto the record's pending UPDATE.
 */
describe("addToSyncQueue collapses a repeat UPDATE onto the pending one", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let helpers: typeof import("@/lib/db/base-helpers");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    helpers = await import("@/lib/db/base-helpers");

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
      `DELETE FROM products; DELETE FROM _sync_queue; DELETE FROM audit_logs;`,
    );
    db.run(
      `INSERT INTO products (id, name, selling_price, markup_percentage, _version, _synced, _deleted)
       VALUES ('p1', 'Paracetamol', 100, 50, 3, 1, 0),
              ('p2', 'Ibuprofen', 200, 90, 1, 1, 0)`,
    );
    vi.clearAllMocks();
  });

  const queueRows = () =>
    db
      .exec(
        `SELECT id, table_name, record_id, operation, payload, retry_count, next_retry_at
           FROM _sync_queue WHERE table_name = 'products' ORDER BY id`,
      )[0]
      ?.values.map((row) => ({
        id: Number(row[0]),
        table: String(row[1]),
        recordId: String(row[2]),
        operation: String(row[3]),
        payload: JSON.parse(String(row[4])) as Record<string, unknown>,
        retryCount: row[5] === null ? null : Number(row[5]),
        nextRetryAt: row[6] === null ? null : String(row[6]),
      })) ?? [];

  it("keeps one row per record and merges the fields of both edits", async () => {
    await helpers.update("products", "p1", { selling_price: 150 });
    await helpers.update("products", "p1", { markup_percentage: 75 });

    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("UPDATE");
    // The earlier edit's field survives: an update() payload carries only the
    // fields it changed, so replacing rather than merging would drop it.
    expect(rows[0].payload).toMatchObject({ selling_price: 150, markup_percentage: 75 });
  });

  it("does not collapse edits to different records together", async () => {
    await helpers.update("products", "p1", { selling_price: 150 });
    await helpers.update("products", "p2", { selling_price: 250 });

    expect(queueRows().map((r) => r.recordId)).toEqual(["p1", "p2"]);
  });

  it("leaves a pending INSERT as an INSERT and does not collapse onto it", async () => {
    await helpers.insert("products", { id: "p3", name: "Amoxicillin" });
    await helpers.update("products", "p3", { selling_price: 300 });

    const rows = queueRows();
    expect(rows.map((r) => r.operation)).toEqual(["INSERT", "UPDATE"]);
  });

  it("does not collapse onto a pending DELETE", async () => {
    await helpers.softDelete("products", "p1");
    await helpers.update("products", "p1", { selling_price: 150 });

    const rows = queueRows();
    expect(rows.map((r) => r.operation)).toEqual(["DELETE", "UPDATE"]);
  });

  it("carries the pending row's backoff over, so a failing record is not hammered", async () => {
    await helpers.update("products", "p1", { selling_price: 150 });
    db.run(
      `UPDATE _sync_queue SET retry_count = 4, next_retry_at = '2099-01-01T00:00:00Z'`,
    );

    await helpers.update("products", "p1", { markup_percentage: 75 });

    const rows = queueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].retryCount).toBe(4);
    expect(rows[0].nextRetryAt).toBe("2099-01-01T00:00:00Z");
    expect(rows[0].payload).toMatchObject({ selling_price: 150, markup_percentage: 75 });
  });

  it("holds the queue at one row across a whole-catalogue second pass", async () => {
    for (const id of ["p1", "p2"]) {
      await helpers.update("products", id, { selling_price: 111 });
    }
    for (const id of ["p1", "p2"]) {
      await helpers.update("products", id, { selling_price: 222 });
    }

    const rows = queueRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.payload.selling_price === 222)).toBe(true);
  });
});

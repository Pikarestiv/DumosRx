import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Phase 3 of the stuck-data work. `_sync_queue` is client-only, so what is
 * stuck has always been inferred rather than known.
 */
describe("buildQueueStateReport", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let buildQueueStateReport: typeof import("@/lib/db/sync-engine/queue-state").buildQueueStateReport;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ buildQueueStateReport } = await import("@/lib/db/sync-engine/queue-state"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM _sync_queue;");
    core.setActiveStoreId("store-1");
  });

  const queue = (id: number, retries: number, lastError: string | null = null, table = "sales") => {
    const err = lastError === null ? "NULL" : `'${lastError.replace(/'/g, "''")}'`;
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, retry_count, last_error, created_at)
       VALUES (${id}, '${table}', 'rec-${id}', 'INSERT', '{}', ${retries}, ${err}, '2026-10-07T00:00:00.000Z')`,
    );
  };

  it("reports the whole queue depth, not just the stuck part", async () => {
    queue(1, 0);
    queue(2, 1);
    queue(3, 6, "forbidden");

    const report = await buildQueueStateReport();

    expect(report?.queue_depth).toBe(3);
    expect(report?.stuck).toHaveLength(1);
  });

  it("counts an item as stuck only once it has exhausted its retries", async () => {
    queue(1, 4, "forbidden");
    queue(2, 5, "forbidden");

    const report = await buildQueueStateReport();

    expect(report?.stuck.map((s) => s.record_id)).toEqual(["rec-2"]);
  });

  it("carries the table, record and attempt count an operator needs", async () => {
    queue(1, 7, "sync_disabled", "stock_movements");

    const [item] = (await buildQueueStateReport())!.stuck;

    expect(item.table_name).toBe("stock_movements");
    expect(item.record_id).toBe("rec-1");
    expect(item.attempts).toBe(7);
    expect(item.reason).toBe("sync_disabled");
  });

  /** base-helpers marks an already-reported error with this prefix. */
  it("strips the reported marker from the reason", async () => {
    queue(1, 6, "[REPORTED] forbidden");

    expect((await buildQueueStateReport())!.stuck[0].reason).toBe("forbidden");
  });

  it("bounds the reported list", async () => {
    for (let i = 1; i <= 80; i++) {
      queue(i, 6, "forbidden");
    }

    const report = await buildQueueStateReport();

    expect(report!.stuck.length).toBeLessThanOrEqual(50);
    expect(report!.queue_depth).toBe(80);
  });

  it("returns null rather than throwing without an active store", async () => {
    core.setActiveStoreId(null);

    expect(await buildQueueStateReport()).toBeNull();
  });
});

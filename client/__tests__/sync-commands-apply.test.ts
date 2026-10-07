import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Phase 4. These commands are the only thing in the system that lets an
 * operator act on a customer's device, so the guards ARE the feature.
 *
 * In particular: a business record exists only on the device that made it, so
 * abandoning a queued sale or stock movement would permanently lose revenue
 * data or falsify stock. The client refuses independently of the server —
 * two locks, because a client must never rely on a check it cannot see.
 */
describe("applySyncCommands", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let applySyncCommands: typeof import("@/lib/db/sync-engine/sync-commands").applySyncCommands;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ applySyncCommands } = await import("@/lib/db/sync-engine/sync-commands"));

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
  });

  const queue = (id: number, table: string, recordId: string, retries = 7) => {
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, retry_count, last_error, created_at)
       VALUES (${id}, '${table}', '${recordId}', 'INSERT', '{}', ${retries}, 'forbidden', '2026-10-07T00:00:00.000Z')`,
    );
  };

  const queueRow = (recordId: string) =>
    db.exec(`SELECT retry_count, last_error FROM _sync_queue WHERE record_id = '${recordId}'`);

  it("resets the backoff on a retry", async () => {
    queue(1, "sales", "r1");

    const [result] = await applySyncCommands([
      { id: "c1", action: "retry", table_name: "sales", record_id: "r1" },
    ]);

    expect(result.status).toBe("applied");
    expect(queueRow("r1")[0].values[0][0]).toBe(0);
    expect(queueRow("r1")[0].values[0][1]).toBeNull();
  });

  /** The owner's constraint, enforced client-side as well as server-side. */
  it("refuses to abandon a business record and leaves the row untouched", async () => {
    queue(1, "stock_movements", "r1");

    const [result] = await applySyncCommands([
      { id: "c1", action: "abandon", table_name: "stock_movements", record_id: "r1" },
    ]);

    expect(result.status).toBe("refused");
    expect(result.result).toMatch(/business data/i);
    expect(queueRow("r1")[0].values).toHaveLength(1);
  });

  it("refuses to abandon a sale too", async () => {
    queue(1, "sales", "r1");

    const [result] = await applySyncCommands([
      { id: "c1", action: "abandon", table_name: "sales", record_id: "r1" },
    ]);

    expect(result.status).toBe("refused");
    expect(queueRow("r1")[0].values).toHaveLength(1);
  });

  it("abandons a diagnostic row when asked", async () => {
    queue(1, "feedback", "crash-1");

    const [result] = await applySyncCommands([
      { id: "c1", action: "abandon", table_name: "feedback", record_id: "crash-1" },
    ]);

    expect(result.status).toBe("applied");
    expect(queueRow("crash-1")[0]).toBeUndefined();
  });

  /** An allowlist: an unfamiliar table is not discardable by default. */
  it("refuses to abandon a table it does not recognise", async () => {
    queue(1, "some_new_table", "r1");

    const [result] = await applySyncCommands([
      { id: "c1", action: "abandon", table_name: "some_new_table", record_id: "r1" },
    ]);

    expect(result.status).toBe("refused");
    expect(queueRow("r1")[0].values).toHaveLength(1);
  });

  it("refuses an action it does not recognise rather than dispatching it", async () => {
    const [result] = await applySyncCommands([
      { id: "c1", action: "drop_everything", table_name: "sales", record_id: "r1" },
    ]);

    expect(result.status).toBe("refused");
    expect(result.result).toMatch(/unknown action/i);
  });

  it("reports a miss rather than silently succeeding", async () => {
    const [result] = await applySyncCommands([
      { id: "c1", action: "retry", table_name: "sales", record_id: "does-not-exist" },
    ]);

    expect(result.status).toBe("refused");
    expect(result.result).toMatch(/no matching queue row/i);
  });

  it("keeps going when one command fails", async () => {
    queue(1, "sales", "r1");

    const results = await applySyncCommands([
      { id: "c1", action: "retry", table_name: "sales", record_id: "missing" },
      { id: "c2", action: "retry", table_name: "sales", record_id: "r1" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[1].status).toBe("applied");
  });
});

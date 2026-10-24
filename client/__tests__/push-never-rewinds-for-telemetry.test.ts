import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const apiClient = { pushChanges: vi.fn() };
vi.mock("@/lib/api/client", () => ({ apiClient }));

// A crash log that conflicts used to rewind the `feedback` pull window like any other table.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-push-never-rewinds-for-telemetry-test-ts-L12
describe("a terminal conflict on telemetry never rewinds a pull window", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run("ALTER TABLE products ADD COLUMN store_id TEXT");
    core.__setDatabaseForTesting(db);
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
  });

  beforeEach(() => {
    db.run("DELETE FROM _sync_queue; DELETE FROM _sync_state; DELETE FROM feedback; DELETE FROM products;");
    apiClient.pushChanges.mockReset();
    core.setActiveStoreId("store-1");
  });

  const queueConflict = (table: string, recordId: string) => {
    const row = db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('${table}', '${recordId}', 'UPDATE', '{"id":"${recordId}","_version":1}', '2026-10-12T00:00:00Z')
       RETURNING id`,
    );
    const queueId = row[0].values[0][0] as number;
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: queueId, table_name: table, record_id: recordId, reason: "version_conflict" }],
    });
  };

  const windowOf = (table: string) => {
    const res = db.exec(
      `SELECT last_synced_at, rewind_count FROM _sync_state WHERE store_id = 'store-1' AND table_name = '${table}'`,
    );
    return res[0]?.values[0] ?? null;
  };

  it("leaves the feedback window untouched", async () => {
    db.run(
      `INSERT INTO feedback (id, type, content, status, created_at, updated_at, _synced, _version)
       VALUES ('fb-1', 'crash', 'boom', 'pending', '2026-10-12T00:00:00Z', '2026-10-12T00:00:00Z', 0, 1)`,
    );
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor, rewind_count)
       VALUES ('store-1', 'feedback', '2026-10-12T10:00:00Z', NULL, 0)`,
    );
    queueConflict("feedback", "fb-1");

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await pushChanges();
    info.mockRestore();

    expect(windowOf("feedback")).toEqual(["2026-10-12T10:00:00Z", 0]);
  });

  /** The behaviour for a real business table must not change: a conflicted
   * row there IS reconcilable by a pull, and the rewind is how it happens. */
  it("still rewinds for an ordinary business table", async () => {
    db.run(
      `INSERT INTO products (id, name, selling_price, store_id, _synced, _version)
       VALUES ('p-1', 'paracetamol', 100, 'store-1', 0, 1)`,
    );
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at, server_cursor, rewind_count)
       VALUES ('store-1', 'products', '2026-10-12T10:00:00Z', NULL, 0)`,
    );
    queueConflict("products", "p-1");

    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await pushChanges();
    info.mockRestore();

    expect(windowOf("products")).toEqual([null, 1]);
  });
});

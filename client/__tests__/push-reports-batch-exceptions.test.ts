import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: vi.fn(),
  },
}));

/**
 * Regression test found via a critical review of sync-engine/: a batch that
 * throws before/during the network call (corrupted queue JSON, a network
 * error, an unexpected response shape) is caught, recorded as a per-item
 * backoff failure, and the loop moves on to the next batch — correct, so one
 * bad batch can't block the rest. But pushChanges() then resolved with
 * {pushed: 0} and no way to tell the caller anything actually went wrong:
 * sync() returned {success: true}, and sync-indicator.tsx showed a green
 * "Sync completed successfully" toast even though nothing was pushed. This
 * proves pushChanges() now reports how many batches hit that exception path.
 */
describe("pushChanges reports batch-level exceptions", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pushChanges: ReturnType<typeof vi.fn> };
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
    db.run(`DELETE FROM products; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
  });

  it("counts a failedBatches of 0 when everything succeeds normally", async () => {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol" })],
    );
    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 1, failed: [] });

    const result = await pushChanges();

    expect(result).toEqual({ pushed: 1, failedBatches: 0 });
  });

  it("counts a failedBatches of 1 and reports 0 pushed when the network call itself throws", async () => {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol" })],
    );
    apiClient.pushChanges.mockRejectedValueOnce(new Error("Network error"));

    const result = await pushChanges();

    expect(result).toEqual({ pushed: 0, failedBatches: 1 });
  });
});

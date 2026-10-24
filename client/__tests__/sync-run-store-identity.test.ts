import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const pushChangesMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pushChanges: (...args: unknown[]) => pushChangesMock(...args),
    pullChanges: vi.fn(() => Promise.resolve({ success: true, changes: {}, server_timestamp: "2026-10-19T00:00:00Z" })),
  },
}));

// A-304. The store a run belongs to is decided once, at the start, and every request and report of that run carries it.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-sync-run-store-identity-test-ts-L17
describe("a sync run keeps one store identity", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let resolveSyncRun: typeof import("@/lib/db/sync-engine/sync-run").resolveSyncRun;
  let setStoredActiveStoreId: typeof import("@/lib/storage-keys").setStoredActiveStoreId;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ resolveSyncRun } = await import("@/lib/db/sync-engine/sync-run"));
    ({ setStoredActiveStoreId } = await import("@/lib/storage-keys"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM _sync_queue; DELETE FROM products;`);
    pushChangesMock.mockReset();
    core.setActiveStoreId("store-a");
    setStoredActiveStoreId("store-a");
    // A real queued change, so pushChanges actually sends a batch: with an
    // empty queue it exchanges reports only, and may send nothing at all.
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('products', 'p1', 'INSERT', '{"id":"p1","name":"Panadol"}', '2026-10-19T00:00:00Z')`,
    );
  });

  it("labels every request with the run's store even if the active store changes mid-run", async () => {
    pushChangesMock.mockImplementation(() => {
      // The user switches store while the request is in flight — the exact
      // window switchStore() leaves open, since it does not cancel a sync.
      core.setActiveStoreId("store-b");
      setStoredActiveStoreId("store-b");
      return Promise.resolve({ success: true, processed: 0, failed: [] });
    });

    const run = resolveSyncRun();
    expect(run.storeId).toBe("store-a");

    await pushChanges(false, false, run);

    // The first push consumed the queue row, so re-seed:
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-run-store-identity-test-ts-L85
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('products', 'p2', 'INSERT', '{"id":"p2","name":"Coartem"}', '2026-10-19T00:01:00Z')`,
    );

    await pushChanges(false, false, run);

    expect(pushChangesMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of pushChangesMock.mock.calls) {
      expect(call[4]).toBe("store-a");
    }
  });

  it("reports for the run's store, not whichever is active when the builder runs", async () => {
    pushChangesMock.mockResolvedValue({ success: true, processed: 0, failed: [] });
    const run = resolveSyncRun();
    core.setActiveStoreId("store-b");
    setStoredActiveStoreId("store-b");

    await pushChanges(false, false, run);

    expect(pushChangesMock).toHaveBeenCalled();
    expect(pushChangesMock.mock.calls[0][4]).toBe("store-a");
  });
});

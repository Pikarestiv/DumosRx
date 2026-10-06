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

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

/**
 * A `permission_denied` rejection means the caller has no access to the row's
 * store at all, so - unlike a version_conflict - no future pull can ever bring
 * the server's version down to settle it. Dropping only the _sync_queue row
 * leaves the source row at `_synced = 0` with no queue entry, which
 * requeueOrphanedRows() (DatabaseProvider, forced on any crash-flagged launch)
 * re-queues into the same refusal forever. See docs/FIXED_BUGS.md A-161.
 */
describe("pushChanges settles permission_denied rows instead of resurrecting them", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let requeueOrphanedRows: typeof import("@/lib/db/reconcile-identity").requeueOrphanedRows;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ requeueOrphanedRows } = await import("@/lib/db/reconcile-identity"));
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
    db.run(`DELETE FROM permission_groups; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
  });

  const queuePermissionGroup = (id: string, storeId: string) => {
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions, created_at, updated_at, _synced, _version)
       VALUES ('${id}', '${storeId}', 'Manager', 'manager', 1, '[]', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', 0, 1)`,
    );
    const queueRow = db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('permission_groups', '${id}', 'INSERT', '{"id":"${id}","store_id":"${storeId}"}', '2026-10-01T00:00:00Z') RETURNING id`,
    );
    return queueRow[0].values[0][0] as number;
  };

  const syncedFlag = (id: string) =>
    db.exec(`SELECT _synced FROM permission_groups WHERE id = '${id}'`)[0].values[0][0];

  const queueCount = () => db.exec(`SELECT COUNT(*) FROM _sync_queue`)[0].values[0][0] as number;

  it("marks the source row synced so a crash-forced requeue cannot resurrect it", async () => {
    const queueId = queuePermissionGroup("16a6f579-b6f5-4fed-b903-bbf8d6c98a73", "other-store");

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [
        {
          id: queueId,
          table_name: "permission_groups",
          record_id: "16a6f579-b6f5-4fed-b903-bbf8d6c98a73",
          reason: "permission_denied",
        },
      ],
    });

    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    await pushChanges();
    consoleInfo.mockRestore();

    expect(queueCount()).toBe(0);
    expect(syncedFlag("16a6f579-b6f5-4fed-b903-bbf8d6c98a73")).toBe(1);

    const requeued = await requeueOrphanedRows(["permission_groups"]);

    expect(requeued.permission_groups).toBeUndefined();
    expect(queueCount()).toBe(0);
  });

  it("still leaves a version_conflict row unsynced for a future pull to reconcile", async () => {
    const queueId = queuePermissionGroup("2cc8cdbf-415e-407b-90d8-678c6f6f9de5", "own-store");

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [
        {
          id: queueId,
          table_name: "permission_groups",
          record_id: "2cc8cdbf-415e-407b-90d8-678c6f6f9de5",
          reason: "version_conflict",
        },
      ],
    });

    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    await pushChanges();
    consoleInfo.mockRestore();

    expect(queueCount()).toBe(0);
    expect(syncedFlag("2cc8cdbf-415e-407b-90d8-678c6f6f9de5")).toBe(0);
  });
});

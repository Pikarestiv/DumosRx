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
 * A terminal conflict (version_conflict/stale_timestamp) deletes the
 * _sync_queue row, but markSynced() only ever runs for changes the server
 * ACCEPTED - so the source row kept `_synced = 0` forever. requeueOrphanedRows()
 * runs on every app boot over STORE_SCOPED_TABLES (audit_logs included) and
 * re-queues any `_synced = 0` row with no queue entry, so the same handful of
 * audit_logs rows were resurrected, re-pushed and re-conflicted on every launch,
 * keeping the user-facing "N unsynced changes" count permanently non-zero.
 *
 * Other tables self-heal because a later pull brings down the server's
 * authoritative row matched by the SAME id. audit_logs can never self-heal that
 * way: the server stores the client's UUID only inside properties->client_id and
 * keeps its own auto-increment bigint as the row id, so no pull will ever match.
 */
describe("pushChanges settles conflicted audit_logs rows instead of resurrecting them", () => {
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
    db.run(`DELETE FROM audit_logs; DELETE FROM feedback; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
  });

  const queueAuditLog = (id: string) => {
    db.run(
      `INSERT INTO audit_logs (id, action, table_name, record_id, created_at, updated_at, _synced)
       VALUES ('${id}', 'LOGIN', 'users', 'u1', '2026-09-26T00:00:00Z', '2026-09-26T00:00:00Z', 0)`,
    );
    const queueRow = db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('audit_logs', '${id}', 'INSERT', '{"id":"${id}"}', '2026-09-26T00:00:00Z') RETURNING id`,
    );
    return queueRow[0].values[0][0] as number;
  };

  const syncedFlag = (table: string, id: string) =>
    db.exec(`SELECT _synced FROM ${table} WHERE id = '${id}'`)[0].values[0][0];

  const queueCount = () => db.exec(`SELECT COUNT(*) FROM _sync_queue`)[0].values[0][0] as number;

  it("marks the source audit_logs row synced so the next boot does not re-queue it", async () => {
    const queueId = queueAuditLog("log-1");

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [
        { id: queueId, table_name: "audit_logs", record_id: "log-1", reason: "stale_timestamp" },
      ],
    });

    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    await pushChanges();
    consoleInfo.mockRestore();

    expect(queueCount()).toBe(0);
    expect(syncedFlag("audit_logs", "log-1")).toBe(1);

    // Simulate the next app boot: DatabaseProvider runs this over
    // STORE_SCOPED_TABLES, which includes audit_logs.
    const requeued = await requeueOrphanedRows(["audit_logs"]);

    expect(requeued.audit_logs).toBeUndefined();
    expect(queueCount()).toBe(0);
  });

  it("leaves a conflicted row on another table unsynced for a future pull to reconcile", async () => {
    db.run(
      `INSERT INTO feedback (id, type, content, status, created_at, updated_at, _synced, _version)
       VALUES ('fb-1', 'bug', 'broken', 'pending', '2026-09-26T00:00:00Z', '2026-09-26T00:00:00Z', 0, 1)`,
    );
    const queueRow = db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('feedback', 'fb-1', 'UPDATE', '{"id":"fb-1","_version":1}', '2026-09-26T00:00:00Z') RETURNING id`,
    );
    const queueId = queueRow[0].values[0][0] as number;

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [
        { id: queueId, table_name: "feedback", record_id: "fb-1", reason: "version_conflict" },
      ],
    });

    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    await pushChanges();
    consoleInfo.mockRestore();

    expect(queueCount()).toBe(0);
    expect(syncedFlag("feedback", "fb-1")).toBe(0);
  });
});

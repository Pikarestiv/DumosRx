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

const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}));

/**
 * audit_logs is push-only telemetry the user never edits locally, same as
 * feedback (which push.ts already silences the same way, just below). It
 * has no `_version` field in its queued payload at all (logAction() never
 * sets one), so a resubmitted INSERT the server already has falls to the
 * legacy stale_timestamp fallback and is rejected as a "conflict" - a sync
 * plumbing detail, not a real edit collision the user made anything happen
 * to. Surfacing it as "A change to Activity Log could not be saved..." is
 * misleading (the user never edited anything) and, combined with the
 * mass-requeue-on-boot bug markSynced() now fixes, was producing a toast
 * loop on every app launch.
 */
describe("pushChanges silences audit_logs version conflicts, same as feedback", () => {
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
    db.run(`DELETE FROM audit_logs; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
    toastWarning.mockClear();
  });

  it("does not toast when the server rejects a resubmitted audit_logs INSERT as a stale-timestamp conflict", async () => {
    db.run(
      `INSERT INTO audit_logs (id, action, table_name, record_id, created_at, _synced) VALUES ('log-1', 'LOGIN', 'users', 'u1', '2026-09-26T00:00:00Z', 0)`,
    );
    const queueRow = db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES ('audit_logs', 'log-1', 'INSERT', '{}', '2026-09-26T00:00:00Z') RETURNING id`,
    );
    const queueId = queueRow[0].values[0][0] as number;

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: queueId, table_name: "audit_logs", record_id: "log-1", reason: "stale_timestamp" }],
    });

    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    await pushChanges();

    expect(toastWarning).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith(
      expect.stringContaining("audit_logs"),
    );
    consoleInfo.mockRestore();
  });
});

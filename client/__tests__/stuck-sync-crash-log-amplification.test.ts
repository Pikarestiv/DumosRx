import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const captureExceptionMock = vi.fn();
const reportClientErrorMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));
vi.mock("@/lib/utils/device-id", () => ({ getDeviceId: () => "test-device" }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { getBaseURL: () => "http://localhost" },
}));
vi.mock("@/lib/api/logger", () => ({
  reportClientError: (...args: unknown[]) => reportClientErrorMock(...args),
}));

/**
 * Regression coverage for the production crash-log amplification loop
 * (Sentry DUMOSRX-CLIENT-1B/17/19/1A/1G/1M, docs/FIXED_BUGS.md SF-CRASH-1).
 *
 * recordSyncFailure() reported a stuck queue item by embedding the raw push
 * error into a new crash description; for a DB-level rejection that error is
 * the whole attempted SQL statement, i.e. a verbatim copy of the row being
 * pushed. logCrash() stores that description as a `feedback` row, which is
 * queued for push, fails the same way, and gets reported again — each
 * generation containing all previous ones until MySQL's column limit is hit,
 * which then fails forever.
 */
describe("stuck sync item crash-log amplification", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let recordSyncFailure: typeof import("@/lib/db/base-helpers").recordSyncFailure;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ recordSyncFailure } = await import("@/lib/db/base-helpers"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM feedback; DELETE FROM _sync_queue; DELETE FROM audit_logs; DELETE FROM products;`);
    captureExceptionMock.mockReset();
    reportClientErrorMock.mockReset();
  });

  /** Mirrors the real captured event shape: a truncation error whose text
   * carries the entire INSERT, including the previous crash's own content. */
  function hugeSqlError(payload: string): string {
    return (
      "SQLSTATE[22001]: String data, right truncated: 1406 Data too long for column 'content' at row 1 " +
      "(Connection: mysql, SQL: insert into `feedback` (`id`, `user_id`, `type`, `content`, `fingerprint`) " +
      `values (11111111-1111-1111-1111-111111111111, u1, bug, ${payload}, sync|whatever))`
    );
  }

  function queueStuckItem(table: string, recordId: string, lastError: string | null = null) {
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at, retry_count, last_error)
       VALUES (1, ?, ?, 'INSERT', '{}', '2026-09-29T00:00:00Z', 4, ?)`,
      [table, recordId, lastError],
    );
  }

  function insertCrashFeedbackRow(id: string, content: string) {
    db.run(
      `INSERT INTO feedback (id, user_id, type, content, fingerprint, occurrence_count, status, created_at, _synced, _deleted)
       VALUES (?, 'u1', 'bug', ?, 'sync|prior crash', 1, 'pending', '2026-09-29T00:00:00Z', 0, 0)`,
      [id, content],
    );
  }

  it("does not create another feedback row when the stuck item is itself a crash-log feedback row", async () => {
    insertCrashFeedbackRow("crash-1", `[CRASH] [WEB] ${hugeSqlError("x".repeat(20_000))}`);
    queueStuckItem("feedback", "crash-1");

    await recordSyncFailure(1, hugeSqlError("y".repeat(20_000)));

    const rows = await core.query<{ id: string; _synced: number }>(`SELECT id, _synced FROM feedback`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("crash-1");

    // Dropped from the queue AND settled, so requeueOrphanedRows() cannot
    // resurrect it into the same permanently-failing push on the next boot.
    const queued = await core.query(`SELECT id FROM _sync_queue`);
    expect(queued).toHaveLength(0);
    expect(rows[0]._synced).toBe(1);

    // Still visible to us — just not through the table that was failing.
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const reported = captureExceptionMock.mock.calls[0][0] as Error;
    expect(reported.message.length).toBeLessThan(500);
    expect(reported.message).toContain("…[truncated]");
  });

  it("cleans up a legacy crash-log item already marked [REPORTED] under the old code instead of retrying it forever", async () => {
    insertCrashFeedbackRow("crash-legacy", `[CRASH] [WEB] ${hugeSqlError("x".repeat(20_000))}`);
    queueStuckItem("feedback", "crash-legacy", `[REPORTED] ${hugeSqlError("x".repeat(200))}`);

    await recordSyncFailure(1, hugeSqlError("y".repeat(20_000)));

    const queued = await core.query(`SELECT id FROM _sync_queue`);
    expect(queued).toHaveLength(0);

    const rows = await core.query<{ id: string; _synced: number }>(`SELECT id, _synced FROM feedback`);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("crash-legacy");
    expect(rows[0]._synced).toBe(1);

    // Already reported under the old code — cleanup must not re-notify.
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("keeps reporting a non-crash-log stuck item exactly once even after it is marked [REPORTED]", async () => {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    queueStuckItem("audit_logs", "a1", "[REPORTED] Unknown column 'occurrence_count' in 'field list'");

    await recordSyncFailure(1, "Unknown column 'occurrence_count' in 'field list'");

    const rows = await core.query(`SELECT id FROM feedback WHERE type = 'bug'`);
    expect(rows).toHaveLength(0);

    const queued = await core.query(`SELECT id FROM _sync_queue`);
    expect(queued).toHaveLength(1);
  });

  it("caps the crash message at a fixed length no matter how large the underlying push error is", async () => {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    queueStuckItem("products", "p1");

    await recordSyncFailure(1, hugeSqlError("z".repeat(100_000)));

    const rows = await core.query<{ content: string }>(`SELECT content FROM feedback WHERE type = 'bug'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain("…[truncated]");
    expect(rows[0].content.length).toBeLessThan(2000);

    const queued = await core.query<{ last_error: string }>(`SELECT last_error FROM _sync_queue WHERE id = 1`);
    expect(queued[0].last_error.length).toBeLessThan(500);
  });

  it("still reports a normal stuck non-feedback item with its full, informative message", async () => {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    queueStuckItem("audit_logs", "a1");

    await recordSyncFailure(1, "Unknown column 'occurrence_count' in 'field list'");

    const rows = await core.query<{ content: string }>(`SELECT content FROM feedback WHERE type = 'bug'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toContain("Sync item stuck after 5 attempts on audit_logs/a1");
    expect(rows[0].content).toContain("Unknown column 'occurrence_count' in 'field list'");
    expect(rows[0].content).not.toContain("…[truncated]");

    const queued = await core.query<{ last_error: string }>(`SELECT last_error FROM _sync_queue WHERE id = 1`);
    expect(queued[0].last_error).toBe("[REPORTED] Unknown column 'occurrence_count' in 'field list'");
  });

  it("leaves genuine user-submitted feedback in the queue to keep retrying", async () => {
    db.run(
      `INSERT INTO feedback (id, user_id, type, content, status, created_at, _synced, _deleted)
       VALUES ('fb-1', 'u1', 'feature_request', 'Please add a dark mode', 'pending', '2026-09-29T00:00:00Z', 0, 0)`,
    );
    queueStuckItem("feedback", "fb-1");

    await recordSyncFailure(1, "Server unavailable");

    const queued = await core.query<{ id: number }>(`SELECT id FROM _sync_queue`);
    expect(queued).toHaveLength(1);

    const rows = await core.query<{ id: string }>(`SELECT id FROM feedback`);
    expect(rows).toHaveLength(1);
  });
});

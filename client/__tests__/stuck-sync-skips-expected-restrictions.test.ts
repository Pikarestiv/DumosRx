import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const captureExceptionMock = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

/**
 * A-172. `logCrash()` has filtered expected plan restrictions since
 * 2026-09-17, so the ordinary stuck path was already covered. What was NOT
 * covered is `reportStuckCrashLog()`, which calls `Sentry.captureException`
 * directly for `feedback` rows and therefore bypasses that filter — the exact
 * table the reported issues were about.
 *
 * These tests assert against the REAL logCrash and the real Sentry boundary;
 * an earlier version mocked logCrash away, which manufactured its own RED by
 * discarding the filter it was supposed to be testing.
 */
describe("stuck sync reporting skips expected plan restrictions", () => {
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
    db.run(`DELETE FROM _sync_queue;`);
    captureExceptionMock.mockClear();
  });

  const queueRow = async (id: number) => {
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, retry_count, created_at)
       VALUES (${id}, 'feedback', 'rec-${id}', 'INSERT', '{}', 4, '2026-10-07T00:00:00.000Z')`,
    );
  };

  it("does not report a plan-restriction refusal as a crash", async () => {
    await queueRow(1);

    await helpers.recordSyncFailure(
      1,
      "Cloud sync is disabled on your current plan. Please upgrade to a premium plan to backup your data.",
    );

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("does not report a sync-throttle refusal as a crash", async () => {
    await queueRow(2);

    await helpers.recordSyncFailure(2, "Sync limit reached. Your current plan synchronizes once every 30 minutes.");

    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  /** A genuine failure must still be reported — the filter must not swallow real bugs. */
  it("still reports a genuine failure", async () => {
    await queueRow(3);

    await helpers.recordSyncFailure(3, "SQLSTATE[42S22]: Column not found: 1054 Unknown column 'foo'");

    expect(captureExceptionMock).toHaveBeenCalled();
  });
});

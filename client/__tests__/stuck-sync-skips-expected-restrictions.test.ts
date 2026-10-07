import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const logCrashMock = vi.fn(async (..._args: unknown[]) => {});

vi.mock("@/lib/utils/error-logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/error-logger")>();
  return { ...actual, logCrash: (...args: unknown[]) => logCrashMock(...args) };
});

/**
 * A-172. A push refused for a plan reason ("Cloud sync is disabled on your
 * current plan", "Sync limit reached") is an intended outcome, not a bug, and
 * the direct report path already filters it. The stuck-item reporter did not:
 * the row simply kept retrying to its ceiling and was then reported as a
 * crash, carrying the user-facing upgrade copy as an error title.
 *
 * A free-plan device's queue never drains, so this fires forever.
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
    logCrashMock.mockClear();
  });

  const queueRow = async (id: number) => {
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, retry_count, created_at)
       VALUES (${id}, 'sales', 'rec-${id}', 'INSERT', '{}', 4, '2026-10-07T00:00:00.000Z')`,
    );
  };

  it("does not report a plan-restriction refusal as a crash", async () => {
    await queueRow(1);

    await helpers.recordSyncFailure(
      1,
      "Cloud sync is disabled on your current plan. Please upgrade to a premium plan to backup your data.",
    );

    expect(logCrashMock).not.toHaveBeenCalled();
  });

  it("does not report a sync-throttle refusal as a crash", async () => {
    await queueRow(2);

    await helpers.recordSyncFailure(2, "Sync limit reached. Your current plan synchronizes once every 30 minutes.");

    expect(logCrashMock).not.toHaveBeenCalled();
  });

  /** A genuine failure must still be reported — the filter must not swallow real bugs. */
  it("still reports a genuine failure", async () => {
    await queueRow(3);

    await helpers.recordSyncFailure(3, "SQLSTATE[42S22]: Column not found: 1054 Unknown column 'foo'");

    expect(logCrashMock).toHaveBeenCalled();
  });
});

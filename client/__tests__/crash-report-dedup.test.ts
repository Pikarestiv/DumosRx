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
 * Coverage for logCrash()'s crash-report coalescing (error-logger.ts): a
 * bug that keeps re-throwing the SAME error should fold into one
 * still-unsynced `feedback` row with a growing occurrence_count, instead
 * of a fresh row (and a fresh sync-queue push) per throw - and the direct
 * reportClientError HTTP call should be throttled the same way, since it
 * fires independently of the local sync queue entirely.
 */
describe("logCrash() crash-report dedup", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let logCrash: typeof import("@/lib/utils/error-logger").logCrash;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ logCrash } = await import("@/lib/utils/error-logger"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM feedback; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    captureExceptionMock.mockReset();
    reportClientErrorMock.mockReset();
  });

  it("coalesces repeated identical crashes into one feedback row with a growing count", async () => {
    const err = new Error("Cannot read properties of undefined (reading 'x')");
    await logCrash(err, false, { area: "pos-cart" });
    await logCrash(err, false, { area: "pos-cart" });
    await logCrash(err, false, { area: "pos-cart" });

    const rows = await core.query<{ id: string; occurrence_count: number }>(
      `SELECT id, occurrence_count FROM feedback WHERE type = 'bug'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].occurrence_count).toBe(3);

    // A repeat's update() must not surface as an Activity Log entry.
    const auditRows = await core.query(`SELECT * FROM audit_logs`);
    expect(auditRows).toHaveLength(0);

    // Every queued push targets the SAME single row (one insert() the first
    // time, then update()s for each repeat) - unlike audit_logs, feedback
    // genuinely supports server-side UPDATE by id, so these coalesce into
    // one final row server-side rather than needing the append-only
    // workaround logAction() uses. The point being tested is "one row,"
    // not "one queue entry."
    const queued = await core.query<{ id: number }>(
      `SELECT id FROM _sync_queue WHERE table_name = 'feedback' AND record_id = ?`,
      [rows[0].id],
    );
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.length).toBeLessThanOrEqual(3);
  });

  it("fingerprints crashes recovered from localStorage, so they are recognisable as crash reports", async () => {
    const { flushPendingCrashes } = await import("@/lib/utils/error-logger");
    const { STORAGE_KEYS } = await import("@/lib/storage-keys");
    localStorage.setItem(
      STORAGE_KEYS.pendingCrashes,
      JSON.stringify([
        {
          message: "Crash captured before the database was ready",
          stack: "Error: boom\n    at boot (app.ts:1:1)",
          platform: "web",
          timestamp: new Date().toISOString(),
        },
      ]),
    );

    await flushPendingCrashes();

    const rows = await core.query<{ type: string; fingerprint: string | null }>(
      `SELECT type, fingerprint FROM feedback`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("bug");
    expect(rows[0].fingerprint).toBeTruthy();
  });

  it("keeps genuinely different crashes in separate rows", async () => {
    await logCrash(new Error("First distinct bug"), false, { area: "pos-cart" });
    await logCrash(new Error("Second distinct bug"), false, { area: "pos-cart" });

    const rows = await core.query<{ id: string }>(`SELECT id FROM feedback WHERE type = 'bug'`);
    expect(rows).toHaveLength(2);
  });

  it("throttles the direct reportClientError call for a repeating crash but still writes each occurrence locally", async () => {
    const err = new Error("Repeating background sync error");
    await logCrash(err, false, { area: "sync" });
    await logCrash(err, false, { area: "sync" });
    await logCrash(err, false, { area: "sync" });

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);

    const rows = await core.query<{ occurrence_count: number }>(
      `SELECT occurrence_count FROM feedback WHERE type = 'bug'`,
    );
    expect(rows[0].occurrence_count).toBe(3);
  });

  it("starts a fresh row once the previous crash report has actually synced", async () => {
    const err = new Error("Recurs across sync boundary");
    await logCrash(err, false, { area: "pos-cart" });
    await core.execute(`UPDATE feedback SET _synced = 1 WHERE type = 'bug'`, []);

    await logCrash(err, false, { area: "pos-cart" });

    const rows = await core.query<{ occurrence_count: number }>(
      `SELECT occurrence_count FROM feedback WHERE type = 'bug' ORDER BY created_at ASC`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].occurrence_count).toBe(1);
    expect(rows[1].occurrence_count).toBe(1);
  });
});

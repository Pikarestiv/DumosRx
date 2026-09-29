import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { SCHEMA_SQL } from "@/lib/db/schema";

/**
 * Regression coverage for A-20 (docs/KNOWN_BUGS.md): `audit_logs` had no
 * local retention anywhere — it grew by 10–15 rows per sale forever, was
 * pulled to every device, and on the web build every single write
 * re-serialises the whole database through `db.export()`. `resetDatabase()`
 * was the only path that ever cleared the table.
 */

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
}));

describe("pruneSyncedAuditLogs()", () => {
  let core: typeof import("@/lib/db/core");
  let retention: typeof import("@/lib/db/retention");
  let SQL: SqlJsStatic;
  let db: Database;

  const NOW = new Date("2026-09-28T00:00:00.000Z");

  function daysAgo(n: number): string {
    return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
  }

  function addAuditRow(
    id: string,
    createdAt: string,
    synced: 0 | 1,
  ): void {
    db.run(
      `INSERT INTO audit_logs (id, user_id, store_id, action, table_name, record_id, created_at, _synced)
       VALUES (?, 'u1', 's1', 'CREATE', 'sales', 'r1', ?, ?)`,
      [id, createdAt, synced],
    );
  }

  function auditIds(): string[] {
    const res = db.exec("SELECT id FROM audit_logs ORDER BY id");
    return (res[0]?.values ?? []).map((r) => String(r[0]));
  }

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    retention = await import("@/lib/db/retention");
    SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  it("drops synced audit rows older than the retention window", async () => {
    addAuditRow("old", daysAgo(800), 1);
    addAuditRow("recent", daysAgo(10), 1);

    const deleted = await retention.pruneSyncedAuditLogs({ now: NOW });

    expect(deleted).toBe(1);
    expect(auditIds()).toEqual(["recent"]);
  });

  it("never drops a row this device has not pushed yet, however old it is", async () => {
    addAuditRow("unsynced-ancient", daysAgo(5000), 0);

    const deleted = await retention.pruneSyncedAuditLogs({ now: NOW });

    expect(deleted).toBe(0);
    expect(auditIds()).toEqual(["unsynced-ancient"]);
  });

  it("never drops a row that still has a pending _sync_queue entry", async () => {
    addAuditRow("queued", daysAgo(900), 1);
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('audit_logs', 'queued', 'INSERT', '{}', ?)`,
      [daysAgo(900)],
    );

    const deleted = await retention.pruneSyncedAuditLogs({ now: NOW });

    expect(deleted).toBe(0);
    expect(auditIds()).toEqual(["queued"]);
  });

  it("does not enqueue a sync delete — the server keeps the full trail", async () => {
    addAuditRow("old", daysAgo(800), 1);

    await retention.pruneSyncedAuditLogs({ now: NOW });

    const queued = db.exec("SELECT COUNT(*) FROM _sync_queue");
    expect(queued[0].values[0][0]).toBe(0);
  });

  it("keeps everything the activity log's widest date-range preset can ask for", async () => {
    addAuditRow("last-calendar-year", daysAgo(700), 1);
    addAuditRow("year-to-date", daysAgo(200), 1);

    await retention.pruneSyncedAuditLogs({ now: NOW });

    expect(auditIds()).toEqual(["last-calendar-year", "year-to-date"]);
  });

  it("runs at most once a day, so it is not a per-sync full-table scan", async () => {
    addAuditRow("old-1", daysAgo(800), 1);
    expect(await retention.pruneSyncedAuditLogs({ now: NOW })).toBe(1);

    addAuditRow("old-2", daysAgo(800), 1);
    expect(
      await retention.pruneSyncedAuditLogs({
        now: new Date(NOW.getTime() + 60 * 60 * 1000),
      }),
    ).toBe(0);
    expect(auditIds()).toEqual(["old-2"]);

    expect(
      await retention.pruneSyncedAuditLogs({
        now: new Date(NOW.getTime() + 25 * 60 * 60 * 1000),
      }),
    ).toBe(1);
    expect(auditIds()).toEqual([]);
  });

  it("honours an explicit retention window", async () => {
    addAuditRow("d100", daysAgo(100), 1);
    addAuditRow("d10", daysAgo(10), 1);

    const deleted = await retention.pruneSyncedAuditLogs({
      now: NOW,
      retentionDays: 90,
    });

    expect(deleted).toBe(1);
    expect(auditIds()).toEqual(["d10"]);
  });

  it("deletes in chunks so a large backlog does not blow the SQL parameter limit", async () => {
    for (let i = 0; i < 950; i++) {
      addAuditRow(`bulk-${i}`, daysAgo(800), 1);
    }

    const deleted = await retention.pruneSyncedAuditLogs({ now: NOW });

    expect(deleted).toBe(950);
    expect(auditIds()).toEqual([]);
  });
});

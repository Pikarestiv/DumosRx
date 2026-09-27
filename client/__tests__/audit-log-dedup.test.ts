import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Coverage for logAction()'s occurrence-count coalescing (core.ts): a
 * repeating DEDUPABLE action (LOGIN_FAILED) for the same (action, table,
 * record_id, store) should fold into one still-unsynced audit_logs row
 * with a growing occurrence_count, and its still-pending _sync_queue
 * INSERT entry should be rewritten in place - not multiplied - so a bug
 * that keeps re-firing doesn't produce one row (and one queued push) per
 * occurrence. A non-dedupable action must still get a fresh row every
 * time, and once a dedupable row has actually synced (_synced = 1), the
 * next repeat must start a NEW row rather than continuing to rewrite the
 * already-sent one.
 */
describe("logAction() dedup for repeating errors", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
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
    core.setActiveStoreId(null);
  });

  it("coalesces repeated LOGIN_FAILED for the same identifier into one row with a growing count", async () => {
    await core.logAction("LOGIN_FAILED", "users", "baduser", { reason: "wrong pin" });
    await core.logAction("LOGIN_FAILED", "users", "baduser", { reason: "wrong pin" });
    await core.logAction("LOGIN_FAILED", "users", "baduser", { reason: "wrong pin" });

    const rows = await core.query<{ id: string; occurrence_count: number }>(
      `SELECT id, occurrence_count FROM audit_logs WHERE action = 'LOGIN_FAILED' AND record_id = 'baduser'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].occurrence_count).toBe(3);

    const queued = await core.query<{ id: number }>(
      `SELECT id FROM _sync_queue WHERE table_name = 'audit_logs' AND record_id = ?`,
      [rows[0].id],
    );
    expect(queued).toHaveLength(1);
  });

  it("does not coalesce a non-dedupable action - a fresh row every time", async () => {
    await core.logAction("PIN_CHANGED", "users", "user-1", {});
    await core.logAction("PIN_CHANGED", "users", "user-1", {});

    const rows = await core.query<{ id: string }>(
      `SELECT id FROM audit_logs WHERE action = 'PIN_CHANGED' AND record_id = 'user-1'`,
    );
    expect(rows).toHaveLength(2);

    const queued = await core.query<{ id: number }>(
      `SELECT id FROM _sync_queue WHERE table_name = 'audit_logs'`,
    );
    expect(queued).toHaveLength(2);
  });

  it("starts a fresh row once the previous one has actually synced", async () => {
    await core.logAction("LOGIN_FAILED", "users", "baduser", {});
    await core.execute(`UPDATE audit_logs SET _synced = 1 WHERE action = 'LOGIN_FAILED'`, []);

    await core.logAction("LOGIN_FAILED", "users", "baduser", {});

    const rows = await core.query<{ occurrence_count: number }>(
      `SELECT occurrence_count FROM audit_logs WHERE action = 'LOGIN_FAILED' AND record_id = 'baduser' ORDER BY created_at ASC`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].occurrence_count).toBe(1);
    expect(rows[1].occurrence_count).toBe(1);
  });

  it("keeps repeats for different record_ids in separate rows", async () => {
    await core.logAction("LOGIN_FAILED", "users", "alice", {});
    await core.logAction("LOGIN_FAILED", "users", "bob", {});
    await core.logAction("LOGIN_FAILED", "users", "alice", {});

    const rows = await core.query<{ record_id: string; occurrence_count: number }>(
      `SELECT record_id, occurrence_count FROM audit_logs WHERE action = 'LOGIN_FAILED' ORDER BY record_id ASC`,
    );
    expect(rows).toEqual([
      { record_id: "alice", occurrence_count: 2 },
      { record_id: "bob", occurrence_count: 1 },
    ]);
  });
});

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
  toast: { warning: vi.fn() },
}));

/**
 * Regression coverage for a second review finding on _known-bugs.md #11's
 * coalescing fix (push-coalesces-same-record-updates.test.ts): coalescing
 * alone isn't enough, because getPendingSyncItems() (via a background,
 * non-manual sync) only returns queue rows that are currently due per
 * `next_retry_at`. Sequence this closes:
 *
 *   1. Edit A on a record fails for a retryable reason and enters backoff
 *      (recordSyncFailure sets next_retry_at in the future).
 *   2. Edit B is queued for the SAME record before A comes due.
 *   3. The next background sync sees only B (A is still backed off) —
 *      without this fix, it would coalesce/push B alone, the server would
 *      accept it and bump the version, and when A later comes due on its
 *      own it would collide against that bump with a stale base version:
 *      a false version_conflict silently dropping A's fields.
 *
 * This is a narrower variant of the original Critical bug (needs a specific
 * retry-timing sequence, not just two ordinary sequential edits), closed by
 * withheldRecordsWithBackedOffSiblingsRemoved() in push.ts: a background
 * sync now holds back EVERY currently-due row for a record that has any
 * sibling row still backed off, rather than letting the due one race ahead.
 */
describe("pushChanges holds back a due edit when a sibling edit for the same record is still backed off", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let update: typeof import("@/lib/db/base-helpers").update;
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert, update } = await import("@/lib/db/base-helpers"));
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
    db.run(`DELETE FROM customers; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    vi.clearAllMocks();
  });

  function clearAuditLogQueueNoise() {
    // See push-coalesces-same-record-updates.test.ts's identical helper:
    // update()/insert() also queue an unrelated audit_logs INSERT on every
    // call, orthogonal to what this file tests.
    db.run(`DELETE FROM _sync_queue WHERE table_name = 'audit_logs'`);
  }

  it("does not push a due edit alone while a sibling edit for the same record is backed off, and pushes both correctly once the sibling also comes due", async () => {
    const customerId = await insert("customers", {
      first_name: "Jane",
      last_name: "Doe",
      outstanding_balance: 0,
      loyalty_points: 10,
    });
    db.run(`DELETE FROM _sync_queue`);

    // Edit A: outstanding_balance. Simulate it having already failed
    // retryably once and entered backoff (as recordSyncFailure would set).
    await update("customers", customerId, { outstanding_balance: 500 });
    clearAuditLogQueueNoise();
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.run(
      `UPDATE _sync_queue SET retry_count = 1, next_retry_at = ? WHERE table_name = 'customers' AND record_id = ?`,
      [farFuture, customerId],
    );

    // Edit B: loyalty_points, queued afterward — due right now (fresh row,
    // next_retry_at is NULL).
    await update("customers", customerId, { loyalty_points: 25 });
    clearAuditLogQueueNoise();

    const dueRows = db.exec(
      `SELECT id FROM _sync_queue WHERE table_name = 'customers' AND (next_retry_at IS NULL OR next_retry_at <= '${new Date().toISOString()}')`,
    );
    // Confirm the test setup itself: exactly one row (B) is actually due.
    expect(dueRows[0].values.length).toBe(1);

    // A background (non-manual) sync must NOT push B alone.
    const result = await pushChanges(false);

    expect(apiClient.pushChanges).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0, failedBatches: 0 });

    // Both rows are still sitting in the queue, untouched.
    const stillQueued = db.exec(
      `SELECT id FROM _sync_queue WHERE table_name = 'customers'`,
    );
    expect(stillQueued[0].values.length).toBe(2);

    // Now A's backoff window has passed — both are due together.
    db.run(`UPDATE _sync_queue SET next_retry_at = NULL WHERE table_name = 'customers'`);

    apiClient.pushChanges.mockImplementationOnce(
      async (req: { changes: Array<{ table_name: string; payload: Record<string, unknown> }> }) => {
        const customerChanges = req.changes.filter((c) => c.table_name === "customers");
        // Coalesced into one change now that both are due together —
        // neither field is lost.
        expect(customerChanges.length).toBe(1);
        expect(customerChanges[0].payload.outstanding_balance).toBe(500);
        expect(customerChanges[0].payload.loyalty_points).toBe(25);
        return {
          success: true,
          processed: 1,
          failed: [],
          versions: { customers: { [customerId]: 2 } },
        };
      },
    );

    const secondResult = await pushChanges(false);
    expect(secondResult.pushed).toBe(2);
    const remaining = db.exec(`SELECT id FROM _sync_queue WHERE table_name = 'customers'`);
    expect(remaining.length).toBe(0);
  });

  it("a manual sync is unaffected — it already bypasses backoff and sees every row for a record together", async () => {
    const customerId = await insert("customers", {
      first_name: "Jane",
      last_name: "Doe",
      outstanding_balance: 0,
      loyalty_points: 10,
    });
    db.run(`DELETE FROM _sync_queue`);

    await update("customers", customerId, { outstanding_balance: 500 });
    clearAuditLogQueueNoise();
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.run(
      `UPDATE _sync_queue SET retry_count = 1, next_retry_at = ? WHERE table_name = 'customers' AND record_id = ?`,
      [farFuture, customerId],
    );

    await update("customers", customerId, { loyalty_points: 25 });
    clearAuditLogQueueNoise();

    apiClient.pushChanges.mockImplementationOnce(
      async (req: { changes: Array<{ table_name: string; payload: Record<string, unknown> }> }) => {
        const customerChanges = req.changes.filter((c) => c.table_name === "customers");
        expect(customerChanges.length).toBe(1); // Coalesced — manual sync sees both.
        expect(customerChanges[0].payload.outstanding_balance).toBe(500);
        expect(customerChanges[0].payload.loyalty_points).toBe(25);
        return { success: true, processed: 1, failed: [] };
      },
    );

    const result = await pushChanges(true); // Manual — ignoreBackoff.
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);
    expect(result.pushed).toBe(2);
  });
});

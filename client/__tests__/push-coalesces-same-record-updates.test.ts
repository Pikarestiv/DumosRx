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
 * Regression coverage for a Critical review finding on the _known-bugs.md
 * #11 fix: update() no longer bumps `_version` locally (correct for the
 * two-device case), but `addToSyncQueue` still appends one new
 * `_sync_queue` row per update() call with NO coalescing. Two ordinary
 * SEQUENTIAL edits to the SAME row before the next sync therefore queue two
 * separate rows that both freeze the identical base `_version`. Pushed
 * together, the server accepts the first (bumping its version) and rejects
 * the second as a false "version_conflict" — a single-device edit silently
 * lost, with a misleading "conflict" signal, even though there was never
 * any other device involved.
 *
 * This reproduces the REAL trigger, not an abstract two-field case:
 * use-pos-payment.ts's mixed/credit checkout does
 * `update("customers", id, {outstanding_balance})` immediately followed by
 * `update("customers", id, {loyalty_points})` on the SAME customer row, with
 * no sync in between (see push.ts's coalescePendingUpdates() doc comment).
 */
describe("pushChanges coalesces multiple pending UPDATEs for the same record", () => {
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
    toastWarning.mockClear();
  });

  // update()/insert() also queue an audit_logs INSERT into _sync_queue on
  // every call (see logAction() in core.ts) — real, correct behavior, but
  // orthogonal to what this file tests (customers-row UPDATE coalescing).
  // Stripped out after each write so assertions here can stay focused on
  // the customers rows specifically, without asserting on audit-log
  // bookkeeping this fix doesn't touch.
  function clearAuditLogQueueNoise() {
    db.run(`DELETE FROM _sync_queue WHERE table_name = 'audit_logs'`);
  }

  it("merges a credit-checkout's outstanding_balance edit and a loyalty-points edit on the same customer into ONE change, carrying the earliest base _version", async () => {
    const customerId = await insert("customers", {
      first_name: "Jane", last_name: "Doe",
      outstanding_balance: 0,
      loyalty_points: 10,
    });
    db.run(`DELETE FROM _sync_queue`); // Clear the INSERT's own queue entry.

    // Mirrors use-pos-payment.ts's mixed/credit checkout: two sequential
    // update() calls on the same customer row, no sync between them.
    await update("customers", customerId, { outstanding_balance: 500 });
    await update("customers", customerId, { loyalty_points: 25 });
    clearAuditLogQueueNoise();

    const queued = db.exec(
      `SELECT id, payload FROM _sync_queue WHERE table_name = 'customers' AND operation = 'UPDATE' ORDER BY id ASC`,
    );
    // Both edits are still two separate local queue rows before push —
    // coalescing happens at push time, not at write time.
    expect(queued[0].values.length).toBe(2);

    apiClient.pushChanges.mockImplementationOnce(async (req: { changes: Array<{ payload: Record<string, unknown> }> }) => {
      // Exactly ONE change reaches the server for this record, not two.
      const customerChanges = req.changes.filter(
        (c) => (c as unknown as { table_name: string }).table_name === "customers",
      );
      expect(customerChanges.length).toBe(1);
      // Both field values are present in the single merged payload.
      expect(customerChanges[0].payload.outstanding_balance).toBe(500);
      expect(customerChanges[0].payload.loyalty_points).toBe(25);
      // Carries the EARLIEST entry's base version (1 — insert()'s starting
      // value; unchanged by either update() per the _version fix), not the
      // second edit's snapshot.
      expect(customerChanges[0].payload._version).toBe(1);

      return {
        success: true,
        processed: 1,
        failed: [],
        versions: { customers: { [customerId]: 2 } },
      };
    });

    const result = await pushChanges();

    // Both underlying queue rows are cleared together — pushedCount counts
    // actual queue rows resolved, matching what markSynced() cleared.
    expect(result.pushed).toBe(2);
    const remaining = db.exec(`SELECT id FROM _sync_queue WHERE table_name = 'customers'`);
    expect(remaining.length).toBe(0);

    // The server's authoritative new version was applied to the local row.
    const row = db.exec(`SELECT _version FROM customers WHERE id = '${customerId}'`);
    expect(row[0].values[0][0]).toBe(2);
  });

  it("on a genuine conflict, drops ALL merged queue rows together and fires exactly ONE toast, not one per underlying edit", async () => {
    const customerId = await insert("customers", {
      first_name: "Jane", last_name: "Doe",
      outstanding_balance: 0,
      loyalty_points: 10,
    });
    db.run(`DELETE FROM _sync_queue`);

    await update("customers", customerId, { outstanding_balance: 500 });
    await update("customers", customerId, { loyalty_points: 25 });
    clearAuditLogQueueNoise();

    // The representative id the coalesced change is sent (and echoed back
    // in `failed`) under is the EARLIEST underlying queue row's id.
    const repIdRow = db.exec(
      `SELECT id FROM _sync_queue WHERE table_name = 'customers' AND record_id = '${customerId}' ORDER BY id ASC LIMIT 1`,
    );
    const repId = repIdRow[0].values[0][0] as number;

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: repId, table_name: "customers", record_id: customerId, reason: "version_conflict" }],
    });
    // The server only ever sees ONE change for this record (asserted in the
    // test above), so it can only ever report ONE failed entry for it — the
    // mock above reflects that real constraint.

    await pushChanges();

    // Every underlying queue row for this record is gone — not just the
    // representative one, which would silently strand the other half of
    // the merged edit forever.
    const remaining = db.exec(`SELECT id FROM _sync_queue WHERE table_name = 'customers'`);
    expect(remaining.length).toBe(0);

    // Exactly one toast for the whole merged conflict, not two.
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce updates to two DIFFERENT records, even in the same table", async () => {
    const customerA = await insert("customers", { first_name: "A", outstanding_balance: 0 });
    const customerB = await insert("customers", { first_name: "B", outstanding_balance: 0 });
    db.run(`DELETE FROM _sync_queue`);

    await update("customers", customerA, { outstanding_balance: 100 });
    await update("customers", customerB, { outstanding_balance: 200 });
    clearAuditLogQueueNoise();

    apiClient.pushChanges.mockImplementationOnce(async (req: { changes: Array<{ table_name: string }> }) => {
      const customerChanges = req.changes.filter((c) => c.table_name === "customers");
      expect(customerChanges.length).toBe(2); // NOT merged — different records.
      return { success: true, processed: 2, failed: [] };
    });

    const result = await pushChanges();
    expect(result.pushed).toBe(2);
  });
});

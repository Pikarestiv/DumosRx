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
 * Regression coverage for a real, reproduced bug: markSynced() only ever
 * DELETEd the processed _sync_queue row — it never set the SOURCE table
 * row's own `_synced` flag back to 1. Every write already sets `_synced = 0`
 * at insert()/update() time (base-helpers.ts), so once its queue row is
 * deleted after a successful push, the row is left permanently looking
 * "unsynced with no queue entry" — exactly the condition
 * requeueOrphanedRows() (reconcile-identity.ts, run every app boot from
 * DatabaseProvider.tsx) treats as needing a fresh queue entry. That
 * mass-requeues a device's entire already-synced history on every boot,
 * producing (for insert-only tables like audit_logs, which the server
 * treats a resubmitted INSERT as a stale-timestamp conflict) a runaway
 * "could not be saved" toast loop and a growing _sync_queue backlog.
 */
describe("pushChanges flags the source row _synced = 1 after a successful push", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let requeueOrphanedRows: typeof import("@/lib/db/reconcile-identity").requeueOrphanedRows;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert } = await import("@/lib/db/base-helpers"));
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
    db.run(`DELETE FROM customers; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    vi.clearAllMocks();
    toastWarning.mockClear();
  });

  it("sets _synced = 1 on the source row once the server accepts it", async () => {
    const customerId = await insert("customers", { first_name: "Jane", last_name: "Doe" });
    db.run(`DELETE FROM _sync_queue WHERE table_name != 'customers'`);

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
      versions: { customers: { [customerId]: 1 } },
    });

    await pushChanges();

    const row = db.exec(`SELECT _synced FROM customers WHERE id = '${customerId}'`);
    expect(row[0].values[0][0]).toBe(1);
  });

  it("stops requeueOrphanedRows() from re-adding an already-synced row on the next boot", async () => {
    const customerId = await insert("customers", { first_name: "Jane", last_name: "Doe" });
    db.run(`DELETE FROM _sync_queue WHERE table_name != 'customers'`);

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
      versions: { customers: { [customerId]: 1 } },
    });
    await pushChanges();

    // Simulates the next app boot's unconditional reconciliation pass.
    const result = await requeueOrphanedRows(["customers"]);

    expect(result.customers).toBeUndefined();
    const requeued = db.exec(`SELECT id FROM _sync_queue WHERE record_id = '${customerId}'`);
    expect(requeued.length).toBe(0);
  });
});

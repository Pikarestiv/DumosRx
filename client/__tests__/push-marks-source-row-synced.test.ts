import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
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

// Regression coverage for a real, reproduced bug:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-push-marks-source-row-synced-test-ts-L22
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

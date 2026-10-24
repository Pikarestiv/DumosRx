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

// Regression test for a real crash:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-push-limits-conflict-toasts-test-ts-L22
describe("pushChanges never fires one toast per conflict in an unbounded loop", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert } = await import("@/lib/db/base-helpers"));
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

  it("shows one aggregate toast, not one per record, when a batch reports many conflicts at once", async () => {
    const CONFLICT_COUNT = 30;
    const customerIds: string[] = [];
    for (let i = 0; i < CONFLICT_COUNT; i++) {
      customerIds.push(await insert("customers", { first_name: `C${i}` }));
    }
    db.run(`DELETE FROM _sync_queue WHERE table_name != 'customers'`);

    const queueRows = db.exec(
      `SELECT id, record_id FROM _sync_queue WHERE table_name = 'customers' ORDER BY id ASC`,
    );
    const failed = queueRows[0].values.map(([id, recordId]) => ({
      id: id as number,
      table_name: "customers",
      record_id: recordId as string,
      reason: "version_conflict",
    }));

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed,
    });

    await pushChanges();

    expect(toastWarning.mock.calls.length).toBeLessThan(10);
  });
});

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

// Regression test for a real report:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-push-manual-bypasses-backoff-test-ts-L15
describe("pushChanges manual bypass of retry backoff", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
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
    db.run(`DELETE FROM products; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
  });

  function queueItemInBackoff() {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at, retry_count, next_retry_at)
       VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z', 6, ?)`,
      [JSON.stringify({ id: "p1", name: "Panadol" }), farFuture],
    );
  }

  // The request that does go out carries no changes:
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-push-manual-bypasses-backoff-test-ts-L63
  it("a background (non-manual) sync sends no changes for items still in backoff", async () => {
    queueItemInBackoff();

    const result = await pushChanges(false);

    for (const call of apiClient.pushChanges.mock.calls) {
      expect(call[0].changes).toEqual([]);
    }
    expect(result).toEqual({ pushed: 0, failedBatches: 0 });
  });

  it("a manual sync attempts items even while they're still in backoff", async () => {
    queueItemInBackoff();
    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 1, failed: [] });

    const result = await pushChanges(true);

    expect(apiClient.pushChanges).toHaveBeenCalled();
    expect(result).toEqual({ pushed: 1, failedBatches: 0 });
  });
});

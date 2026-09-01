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

/**
 * Regression test for a real report: after a large import produced many
 * repeated sync failures, the resulting exponential backoff (capped at 1
 * hour — see recordSyncFailure in base-helpers.ts) left every queued item's
 * next_retry_at in the future. getPendingSyncItems() correctly excludes
 * those from a background auto-sync, but pushChanges() applied that same
 * filter even for an explicit, user-clicked "Sync Now" — so a manual sync
 * silently pushed nothing (no network request at all) and still reported
 * "success", with no way for the user to force a retry before the backoff
 * window passed. A manual sync should always attempt the full queue.
 */
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

  it("a background (non-manual) sync skips items still in backoff and makes no API call", async () => {
    queueItemInBackoff();

    const result = await pushChanges(false);

    expect(apiClient.pushChanges).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0 });
  });

  it("a manual sync attempts items even while they're still in backoff", async () => {
    queueItemInBackoff();
    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 1, failed: [] });

    const result = await pushChanges(true);

    expect(apiClient.pushChanges).toHaveBeenCalled();
    expect(result).toEqual({ pushed: 1 });
  });
});

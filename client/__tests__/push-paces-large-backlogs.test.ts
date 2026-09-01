import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
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
 * Regression test for a real report: the backoff-bypass fix means a manual
 * sync can now fire dozens of batch requests back-to-back with no spacing,
 * which the API's throttle:60,1 middleware (60 requests/minute, see
 * routes/api.php) rejects with "Too Many Attempts" once a large backlog
 * (e.g. ~2488 items / 50 per batch = ~50 requests) is retried in one run.
 * A short pause between batches keeps a large backlog under that budget.
 */
describe("pushChanges paces batches to avoid the API rate limit", () => {
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function queueItems(count: number) {
    for (let i = 0; i < count; i++) {
      db.run(`INSERT INTO products (id, name, _deleted) VALUES (?, ?, 0)`, [`p${i}`, `Product ${i}`]);
      db.run(
        `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (?, 'products', ?, 'INSERT', ?, ?)`,
        [i + 1, `p${i}`, JSON.stringify({ id: `p${i}`, name: `Product ${i}` }), `2026-08-01T00:00:${String(i).padStart(2, "0")}Z`],
      );
    }
  }

  it("does not pause between batches when everything fits in a single batch", async () => {
    queueItems(10); // one batch (SYNC_BATCH_SIZE = 50)
    apiClient.pushChanges.mockResolvedValue({ success: true, processed: 10, failed: [] });

    const runPromise = pushChanges();
    await vi.runAllTimersAsync();
    await runPromise;

    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);
  });

  it("pauses between batches when the backlog spans more than one", async () => {
    queueItems(120); // three batches of 50
    apiClient.pushChanges.mockResolvedValue({ success: true, processed: 50, failed: [] });

    const runPromise = pushChanges();
    // Let only the first batch's request resolve; without pacing all three
    // batches would already have fired by now since nothing else awaits.
    await vi.advanceTimersByTimeAsync(0);
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();
    await runPromise;
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(3);
  });
});

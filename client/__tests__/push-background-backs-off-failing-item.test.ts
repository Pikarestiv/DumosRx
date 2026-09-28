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
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

/**
 * A queue item the server rejects for a permanent, non-conflict reason
 * (unknown column, FK violation) must back off exponentially across
 * repeated BACKGROUND sync cycles rather than being re-sent on every one.
 * It used to be re-sent every cycle because the auto-sync daemon called
 * sync(true) — and `isManual` also means "ignore per-item backoff" (see
 * docs/FIXED_BUGS.md, A-5).
 */
describe("pushChanges backs a permanently-failing item off across background cycles", () => {
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

  function queueAFreshItem() {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol" })],
    );
  }

  it("re-sends the item once, then holds it back on the next background cycle", async () => {
    queueAFreshItem();
    apiClient.pushChanges.mockResolvedValue({
      success: true,
      processed: 0,
      failed: [
        { id: 1, table_name: "products", record_id: "p1", reason: "Unknown column 'foo'" },
      ],
    });

    await pushChanges(false);
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);

    const afterFirst = db.exec(`SELECT retry_count, next_retry_at FROM _sync_queue WHERE id = 1`);
    expect(afterFirst[0].values[0][0]).toBe(1);
    expect(afterFirst[0].values[0][1]).not.toBeNull();

    // Second background cycle, immediately after: the item is still inside
    // its backoff window, so nothing should go over the wire at all.
    const second = await pushChanges(false);
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ pushed: 0, failedBatches: 0 });

    // Third cycle, same: the retry counter must not keep climbing either.
    await pushChanges(false);
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);
    const afterThird = db.exec(`SELECT retry_count FROM _sync_queue WHERE id = 1`);
    expect(afterThird[0].values[0][0]).toBe(1);
  });

  it("an explicit manual sync still bypasses that backoff", async () => {
    queueAFreshItem();
    apiClient.pushChanges.mockResolvedValue({
      success: true,
      processed: 0,
      failed: [
        { id: 1, table_name: "products", record_id: "p1", reason: "Unknown column 'foo'" },
      ],
    });

    await pushChanges(false);
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(1);

    await pushChanges(true);
    expect(apiClient.pushChanges).toHaveBeenCalledTimes(2);
  });
});

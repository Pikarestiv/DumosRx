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
 * Regression coverage for _known-bugs.md #11's client-side conflict
 * handling: a `version_conflict` (or legacy `stale_timestamp`) entry in
 * response.failed means this exact edit's base version is permanently
 * stale — retrying it through recordSyncFailure's exponential-backoff path
 * can never succeed, since the base version doesn't change no matter how
 * many times it's resent. push.ts must instead drop the item from
 * `_sync_queue` outright and surface a visible, "loud not silent" signal
 * (a toast), rather than the old silent-retry-forever (or silent-accept)
 * behavior.
 */
describe("pushChanges handles a version_conflict failure as non-retryable", () => {
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
    toastWarning.mockClear();
  });

  function queueOneUpdate() {
    db.run(`INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p1', 'Maca Gummies', 777, 1, 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (1, 'products', 'p1', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "p1", selling_price: 777, _version: 1 })],
    );
  }

  it("removes a version_conflict item from _sync_queue instead of retrying it, and does not mark it synced", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "version_conflict" }],
    });

    const result = await pushChanges();

    // Not counted as pushed (it was rejected), but also not left to retry.
    expect(result.pushed).toBe(0);

    const remaining = db.exec(`SELECT id FROM _sync_queue`);
    expect(remaining.length).toBe(0); // The queue item is gone.
  });

  it("does NOT route a version_conflict through recordSyncFailure's backoff path (no retry_count/next_retry_at bump anywhere, because the row was deleted, not updated)", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "version_conflict" }],
    });

    await pushChanges();

    // If this had gone through recordSyncFailure, the row would still exist
    // with retry_count = 1 instead of being deleted outright.
    const row = db.exec(`SELECT * FROM _sync_queue WHERE id = 1`);
    expect(row.length).toBe(0);
  });

  it("surfaces a visible toast naming the conflicted record, not a silent drop", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "version_conflict" }],
    });

    await pushChanges();

    expect(toastWarning).toHaveBeenCalledTimes(1);
    const message = toastWarning.mock.calls[0][0] as string;
    expect(message).toContain("conflicted");
    expect(message.toLowerCase()).toContain("product");
  });

  it("still routes an ordinary (non-conflict) failure reason through the normal backoff path, unaffected by this change", async () => {
    queueOneUpdate();
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: 1, table_name: "products", record_id: "p1", reason: "Some other server error" }],
    });

    await pushChanges();

    // Not deleted — still present, tracked for retry via recordSyncFailure.
    const row = db.exec(`SELECT retry_count FROM _sync_queue WHERE id = 1`);
    expect(row.length).toBe(1);
    expect(row[0].values[0][0]).toBe(1);

    // No conflict toast for an ordinary retryable failure.
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("applies the server's authoritative returned version to the local row for an accepted UPDATE", async () => {
    db.run(`INSERT INTO products (id, name, selling_price, _version, _deleted) VALUES ('p2', 'Panadol', 600, 1, 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at)
       VALUES (2, 'products', 'p2', 'UPDATE', ?, '2026-09-04T00:00:00Z')`,
      [JSON.stringify({ id: "p2", selling_price: 600, _version: 1 })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [],
      versions: { products: { p2: 2 } },
    });

    const result = await pushChanges();

    expect(result.pushed).toBe(1);
    const row = db.exec(`SELECT _version FROM products WHERE id = 'p2'`);
    expect(row[0].values[0][0]).toBe(2);
  });
});

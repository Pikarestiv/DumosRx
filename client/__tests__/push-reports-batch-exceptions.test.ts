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

// Regression test found via a critical review of sync-engine/:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-push-reports-batch-exceptions-test-ts-L15
describe("pushChanges reports batch-level exceptions", () => {
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

  it("counts a failedBatches of 0 when everything succeeds normally", async () => {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol" })],
    );
    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 1, failed: [] });

    const result = await pushChanges();

    expect(result).toEqual({ pushed: 1, failedBatches: 0 });
  });

  it("counts a failedBatches of 1 and reports 0 pushed when the network call itself throws", async () => {
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol" })],
    );
    apiClient.pushChanges.mockRejectedValueOnce(new Error("Network error"));

    const result = await pushChanges();

    expect(result).toEqual({ pushed: 0, failedBatches: 1 });
  });

  // Regression: a batch-level `{ success:
  // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-push-reports-batch-exceptions-test-ts-L79
  describe("a batch-level success:false response (not a thrown exception)", () => {
    it("counts it in failedBatches and reports 0 pushed", async () => {
      db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
      db.run(
        `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
        [JSON.stringify({ id: "p1", name: "Panadol" })],
      );
      apiClient.pushChanges.mockResolvedValueOnce({ success: false, message: "Unauthorized" });

      const result = await pushChanges();

      expect(result).toEqual({ pushed: 0, failedBatches: 1 });
    });

    it("records a backoff-tracked failure (retry_count/last_error) on the queue item instead of leaving it untouched", async () => {
      db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Panadol', 0)`);
      db.run(
        `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
        [JSON.stringify({ id: "p1", name: "Panadol" })],
      );
      apiClient.pushChanges.mockResolvedValueOnce({ success: false, message: "Unauthorized" });

      await pushChanges();

      const rows = db.exec(`SELECT retry_count, last_error, next_retry_at FROM _sync_queue WHERE id = 1`);
      const [retryCount, lastError, nextRetryAt] = rows[0].values[0];
      expect(retryCount).toBe(1);
      expect(lastError).toContain("Unauthorized");
      expect(nextRetryAt).not.toBeNull();
    });
  });
});

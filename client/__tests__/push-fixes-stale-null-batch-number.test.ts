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
 * Regression test for a real report: fixing importProductRows() to stop
 * writing batch_number: null (see product-import.ts) only prevents NEW
 * stock_batches inserts from having the bug — any row already sitting in
 * _sync_queue keeps its frozen JSON snapshot from before the fix, still
 * carrying the literal null. Those kept failing the server's NOT NULL
 * constraint on every retry, indefinitely, since a client code fix alone
 * can't rewrite data already queued. Confirmed via a real failure log: a
 * still-queued stock_batches INSERT from before the fix, retried after the
 * backoff-bypass change, failing with the exact same "Column batch_number
 * cannot be null" error. push.ts must patch it defensively at push time.
 */
describe("pushChanges patches a stale null batch_number before sending", () => {
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
    db.run(`DELETE FROM stock_batches; DELETE FROM _sync_queue;`);
    vi.clearAllMocks();
  });

  it("defaults a null batch_number to 'Opening Stock' in the outgoing payload", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, _deleted) VALUES ('b1', 'p1', NULL, 5, 0)`,
    );
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'stock_batches', 'b1', 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [JSON.stringify({ id: "b1", product_id: "p1", batch_number: null, quantity: 5 })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 1, failed: [] });

    await pushChanges();

    const sentChanges = apiClient.pushChanges.mock.calls[0][0].changes;
    expect(sentChanges[0].payload.batch_number).toBe("Opening Stock");
  });
});

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
 * Regression test for a real crash: once a manual sync started retrying a
 * large (~2488 item) backlog in one run (see the backoff-bypass fix), each
 * synced/failed item in a batch called recordSyncFailure/markSynced, which
 * each call execute() outside of transaction() — and execute() triggers a
 * full db.export() (the whole database re-serialized into a fresh
 * ArrayBuffer) after every single statement when not inside a transaction
 * (see transaction()'s own doc comment in core.ts). Dozens of exports per
 * batch, times ~50 batches, exhausted memory ("Array buffer allocation
 * failed") and left the WASM heap in a state where subsequent prepare()
 * calls threw "bad parameter or other API misuse". Wrapping each batch's
 * local writes in a single transaction() defers that export to once per
 * batch instead of once per item.
 */
describe("pushChanges batches its local writes into a single db export", () => {
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

  it("calls db.export at most once for a batch with several failing items", async () => {
    const itemCount = 5;
    for (let i = 0; i < itemCount; i++) {
      db.run(`INSERT INTO products (id, name, _deleted) VALUES (?, ?, 0)`, [`p${i}`, `Product ${i}`]);
      db.run(
        `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (?, 'products', ?, 'INSERT', ?, ?)`,
        [i + 1, `p${i}`, JSON.stringify({ id: `p${i}`, name: `Product ${i}` }), `2026-08-01T00:00:0${i}Z`],
      );
    }

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: Array.from({ length: itemCount }, (_, i) => ({
        id: i + 1,
        table_name: "products",
        record_id: `p${i}`,
        reason: "some transient server error",
      })),
    });

    const exportSpy = vi.spyOn(db, "export");

    await pushChanges();

    expect(exportSpy).toHaveBeenCalledTimes(1);

    exportSpy.mockRestore();
  });
});

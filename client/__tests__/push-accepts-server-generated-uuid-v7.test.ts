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
 * push.ts guards products against a non-UUID category_id/supplier_id so one
 * bad row cannot block the whole queue. Its version nibble was [1-5], which
 * only admits UUID v1-v5 — but Laravel's HasUuids emits **v7**, so any row
 * the SERVER created and a product then referenced was rejected by the
 * client's own guard and parked in _sync_queue indefinitely.
 *
 * Hit in production: sync:repair-cross-tenant-categories created one
 * category server-side for store 571582a9, and products repointed onto it
 * could never push ("Invalid category_id (not a UUID)", DUMOSRX-CLIENT-22).
 * A real v7 id from that server is used below.
 */
const SERVER_V7_CATEGORY_ID = "01a11c6e-12dc-72a6-bc2c-cd1c32d206b9";
const CLIENT_V4_CATEGORY_ID = "b1e4c0e5-2354-4ff9-98e4-69d3b4c482fa";

describe("pushChanges accepts a server-generated UUID v7 foreign key", () => {
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
    apiClient.pushChanges.mockResolvedValue({
      success: true,
      processed: 1,
      failed: [],
      id_map: {},
      versions: {},
    });
  });

  function queueProduct(id: string, categoryId: string) {
    db.run(
      `INSERT INTO products (id, name, category_id, selling_price, _deleted, _synced)
       VALUES ('${id}', 'PANADOL', '${categoryId}', 100, 0, 0)`,
    );
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('products', '${id}', 'UPDATE',
               '${JSON.stringify({ id, name: "PANADOL", category_id: categoryId, selling_price: 100 })}',
               '2026-10-08T18:40:00Z')`,
    );
  }

  function pushedProductIds(): string[] {
    const calls = apiClient.pushChanges.mock.calls as unknown as Array<
      [{ changes: Array<{ table_name: string; record_id: string }> }]
    >;
    return calls.flatMap(([body]) =>
      (body?.changes ?? [])
        .filter((c) => c.table_name === "products")
        .map((c) => c.record_id),
    );
  }

  it("pushes a product whose category_id is a server-generated v7 UUID", async () => {
    queueProduct("p-v7", SERVER_V7_CATEGORY_ID);

    await pushChanges();

    expect(pushedProductIds()).toContain("p-v7");
  });

  it("still pushes a product whose category_id is a client-generated v4 UUID", async () => {
    queueProduct("p-v4", CLIENT_V4_CATEGORY_ID);

    await pushChanges();

    expect(pushedProductIds()).toContain("p-v4");
  });

  it("still rejects a category_id that is a plain name rather than any UUID", async () => {
    queueProduct("p-bad", "Analgesics");

    await pushChanges();

    expect(pushedProductIds()).not.toContain("p-bad");
  });
});

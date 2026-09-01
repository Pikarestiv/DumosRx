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

const LOCAL_CAT = "11111111-1111-4111-8111-111111111111";
const SERVER_CAT = "22222222-2222-4222-8222-222222222222";

/**
 * Regression test for the sync bug reported after a bulk import: the server
 * silently skips an INSERT (and remaps the id) when a category/supplier name
 * collides with one it already has, but that remap only lived in the memory
 * of that single push request server-side (see SyncController::push). A
 * future delta pull only ever reconciles a collision if the pre-existing row
 * it collided with happens to also appear in that pull's response — a
 * long-unchanged row like "DRUGS" or "COSMETICS" never will, so any product
 * referencing the old local id failed its foreign key check forever. This
 * proves push.ts now applies the server's id_map immediately instead of
 * waiting on a pull that may never come.
 */
describe("push.ts id_map reconciliation", () => {
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
    db.run(`
      DELETE FROM categories; DELETE FROM products; DELETE FROM _sync_queue;
    `);
    vi.clearAllMocks();
  });

  it("remaps the live product row and rewrites the still-queued payload when the response reports a duplicate-name skip", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES (?, 'Analgesics', 0)`, [LOCAL_CAT]);
    db.run(`INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'Panadol', ?, 0)`, [LOCAL_CAT]);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'categories', ?, 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [LOCAL_CAT, JSON.stringify({ id: LOCAL_CAT, name: "Analgesics" })],
    );
    // Represents a product still awaiting its own push (e.g. in a later
    // batch) whose frozen payload snapshot still has the stale local id.
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (2, 'products', 'p1', 'INSERT', ?, '2026-08-01T00:00:01Z')`,
      [JSON.stringify({ id: "p1", name: "Panadol", category_id: LOCAL_CAT })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 1,
      failed: [{ id: 2, table_name: "products", record_id: "p1", reason: "Invalid category_id (not a UUID)" }],
      id_map: { categories: { [LOCAL_CAT]: SERVER_CAT } },
    });

    await pushChanges();

    const product = db.exec(`SELECT category_id FROM products WHERE id = 'p1'`);
    expect(product[0].values[0][0]).toBe(SERVER_CAT);

    const localCat = db.exec(`SELECT _deleted FROM categories WHERE id = ?`, [LOCAL_CAT]);
    expect(localCat[0].values[0][0]).toBe(1);

    const queued = db.exec(`SELECT payload FROM _sync_queue WHERE id = 2`);
    const payload = JSON.parse(queued[0].values[0][0] as string);
    expect(payload.category_id).toBe(SERVER_CAT);
  });

  it("does nothing when the response has no id_map", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES (?, 'Analgesics', 0)`, [LOCAL_CAT]);
    db.run(
      `INSERT INTO _sync_queue (id, table_name, record_id, operation, payload, created_at) VALUES (1, 'categories', ?, 'INSERT', ?, '2026-08-01T00:00:00Z')`,
      [LOCAL_CAT, JSON.stringify({ id: LOCAL_CAT, name: "Analgesics" })],
    );

    apiClient.pushChanges.mockResolvedValueOnce({ success: true, processed: 1, failed: [] });

    await pushChanges();

    const localCat = db.exec(`SELECT _deleted FROM categories WHERE id = ?`, [LOCAL_CAT]);
    expect(localCat[0].values[0][0]).toBe(0);
  });
});

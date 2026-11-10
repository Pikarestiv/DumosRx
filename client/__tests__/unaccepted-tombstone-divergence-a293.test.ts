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

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe("A-293 unaccepted tombstone divergence prevention", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pushResponse: typeof import("@/lib/db/sync-engine/push-response");
  let pullReconcile: typeof import("@/lib/db/sync-engine/pull-reconcile");
  let localDb: typeof import("@/lib/db/local-database");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    pushResponse = await import("@/lib/db/sync-engine/push-response");
    pullReconcile = await import("@/lib/db/sync-engine/pull-reconcile");
    localDb = await import("@/lib/db/local-database");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM categories;
      DELETE FROM products;
      DELETE FROM _sync_queue;
      DELETE FROM audit_logs;
    `);
    vi.clearAllMocks();
  });

  it("applyDuplicateNameIdMap hard-deletes the loser row instead of leaving a tombstone", async () => {
    const loserId = "cat-loser-1";
    const winnerId = "cat-winner-2";

    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted) VALUES (?, ?, ?, 0)`,
      [loserId, "Syrups", "store-1"],
    );
    db.run(
      `INSERT INTO products (id, name, category_id, store_id) VALUES (?, ?, ?, ?)`,
      ["prod-1", "Cough Syrup", loserId, "store-1"],
    );

    await pushResponse.applyDuplicateNameIdMap({
      categories: { [loserId]: winnerId },
    });

    const products = await core.query<{ category_id: string }>(
      `SELECT category_id FROM products WHERE id = 'prod-1'`,
    );
    expect(products[0]?.category_id).toBe(winnerId);

    const loserRows = await core.query<{ id: string }>(
      `SELECT id FROM categories WHERE id = ?`,
      [loserId],
    );
    expect(loserRows.length).toBe(0);
  });

  it("applyPurgedIds removes local _deleted = 1 tombstones when confirmed by server", async () => {
    const unacceptedId = "cat-unaccepted-1";

    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted, _synced) VALUES (?, ?, ?, 1, 0)`,
      [unacceptedId, "Typo Cat", "store-1"],
    );

    await pushResponse.applyPurgedIds({
      categories: [unacceptedId],
    });

    const rows = await core.query<{ id: string }>(
      `SELECT id FROM categories WHERE id = ?`,
      [unacceptedId],
    );
    expect(rows.length).toBe(0);
  });

  it("applyPurgedIds never deletes an active (_deleted = 0) row", async () => {
    const activeId = "cat-active-1";

    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted, _synced) VALUES (?, ?, ?, 0, 1)`,
      [activeId, "Active Cat", "store-1"],
    );

    await pushResponse.applyPurgedIds({
      categories: [activeId],
    });

    const rows = await core.query<{ id: string }>(
      `SELECT id FROM categories WHERE id = ?`,
      [activeId],
    );
    expect(rows.length).toBe(1);
  });

  it("reconcileDuplicateNames deletes the local duplicate and removes its pending INSERT from _sync_queue", async () => {
    const localId = "cat-local-dup";
    const serverId = "cat-server-canon";

    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted) VALUES (?, ?, ?, 0)`,
      [localId, "Tablets", "store-1"],
    );
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      ["categories", localId, "INSERT", JSON.stringify({ id: localId, name: "Tablets" })],
    );
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      ["categories", localId, "UPDATE", JSON.stringify({ id: localId, name: "Tablets 2" })],
    );

    await pullReconcile.reconcileDuplicateNames(
      "categories",
      [{ id: serverId, name: "Tablets", store_id: "store-1" }],
    );

    const remainingLocal = await core.query<{ id: string }>(
      `SELECT id FROM categories WHERE id = ?`,
      [localId],
    );
    expect(remainingLocal.length).toBe(0);

    const localQueueItems = await core.query<{ record_id: string }>(
      `SELECT record_id FROM _sync_queue WHERE table_name = 'categories' AND record_id = ?`,
      [localId],
    );
    expect(localQueueItems.length).toBe(0);

    const serverInsertQueue = await core.query<{ record_id: string }>(
      `SELECT record_id FROM _sync_queue WHERE table_name = 'categories' AND record_id = ? AND operation = 'INSERT'`,
      [serverId],
    );
    expect(serverInsertQueue.length).toBe(0);

    const serverUpdateQueue = await core.query<{ record_id: string }>(
      `SELECT record_id FROM _sync_queue WHERE table_name = 'categories' AND record_id = ? AND operation = 'UPDATE'`,
      [serverId],
    );
    expect(serverUpdateQueue.length).toBe(1);
  });

  it("createProduct ignores soft-deleted categories when resolving by name", async () => {
    const deletedCatId = "cat-deleted-old";
    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted) VALUES (?, ?, ?, 1)`,
      [deletedCatId, "Inhalers", "store-1"],
    );

    const prodId = await localDb.createProduct({
      name: "Salbutamol",
      category_id: "Inhalers",
      selling_price: 1000,
    });

    const prod = await core.query<{ category_id: string }>(
      `SELECT category_id FROM products WHERE id = ?`,
      [prodId],
    );
    expect(prod[0]?.category_id).not.toBe(deletedCatId);
  });
});

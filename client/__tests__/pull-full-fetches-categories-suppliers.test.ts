import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

/**
 * Regression test for a real report: the server silently skips inserting a
 * category/supplier whose name collides with one it already has, remapping
 * the id only in that one push request's memory (see SyncController::push).
 * The client's only repair mechanism, DUPLICATE_NAME_TABLES reconciliation
 * below, can only fix a collision if the pre-existing row it collided with
 * appears in THIS pull's response — but a normal delta pull only asks the
 * server for rows changed since last_synced_at, and a long-unchanged
 * category like "DRUGS" never will. The server's pull() treats a table
 * missing from last_synced as "return everything" (no filter applied at
 * all), so categories/suppliers must never be given a last_synced cursor —
 * they're small collections (tens, rarely hundreds), so a full fetch every
 * time costs nothing and closes the gap for good.
 */
describe("pullChanges always full-fetches categories and suppliers", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pullChanges } = await import("@/lib/db/sync-engine/pull"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as {
      apiClient: { pullChanges: ReturnType<typeof vi.fn> };
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
    db.run(`DELETE FROM _sync_state; DELETE FROM categories; DELETE FROM products;`);
    vi.clearAllMocks();
  });

  it("omits categories and suppliers from last_synced even when a cursor is stored for them, but keeps other tables' cursors", async () => {
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES
       ('categories', '2026-08-01T00:00:00Z'),
       ('suppliers', '2026-08-01T00:00:00Z'),
       ('products', '2026-08-15T00:00:00Z')`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {},
      server_timestamp: "2026-09-01T00:00:00Z",
    });

    await pullChanges();

    expect(apiClient.pullChanges).toHaveBeenCalledWith(
      {
        last_synced: { products: "2026-08-15T00:00:00Z" },
      },
      false,
      false,
    );
  });

  it("reconciles a long-unchanged local category once it comes back in the now-full categories response", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('local-cat', 'Analgesics', 0)`);
    db.run(`INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'Panadol', 'local-cat', 0)`);
    db.run(`INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('categories', '2026-08-01T00:00:00Z')`);

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        // The server returns this even though it hasn't changed recently,
        // because categories no longer carry a last_synced cursor at all.
        categories: [{ id: "server-cat", name: "Analgesics", _version: 1 }],
      },
      server_timestamp: "2026-09-01T00:00:00Z",
    });

    await pullChanges();

    const product = db.exec(`SELECT category_id FROM products WHERE id = 'p1'`);
    expect(product[0].values[0][0]).toBe("server-cat");
  });
});

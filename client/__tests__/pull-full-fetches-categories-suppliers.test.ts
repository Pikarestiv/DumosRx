import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: vi.fn(),
  },
}));

// Regression test for a real report:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-full-fetches-categories-suppliers-test-ts-L15
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
        page_offset: {},
        page_cursor: {},
      },
      false,
      false,
      expect.any(String),
      null,
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

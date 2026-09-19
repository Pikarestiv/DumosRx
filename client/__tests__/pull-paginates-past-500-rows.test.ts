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
 * Regression test: SyncController::pull() caps each table at 500 rows/table
 * and now reports has_more per table (see docs/KNOWN_BUGS.md — previously
 * the client fetched exactly one page and stamped its cursor to now()
 * regardless, permanently losing every row past the 500th changed row).
 * pullChanges() must keep requesting pages (bumping page_offset) until the
 * server reports has_more: false for a table before advancing that table's
 * _sync_state cursor.
 */
describe("pullChanges pages past the server's 500-row cap", () => {
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

  it("keeps requesting pages until has_more is false, then advances the cursor once", async () => {
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('products', '2026-08-15T00:00:00Z')`,
    );

    const makeProduct = (n: number) => ({
      id: `prod-${n}`,
      name: `Product ${n}`,
      selling_price: 100,
      updated_at: "2026-09-01T00:00:00Z",
      _version: 1,
    });

    apiClient.pullChanges
      .mockResolvedValueOnce({
        success: true,
        changes: { products: [makeProduct(1), makeProduct(2)] },
        server_timestamp: "2026-09-01T00:00:01Z",
        has_more: { products: true },
      })
      .mockResolvedValueOnce({
        success: true,
        changes: { products: [makeProduct(3)] },
        server_timestamp: "2026-09-01T00:00:02Z",
        has_more: { products: false },
      });

    const result = await pullChanges();

    expect(apiClient.pullChanges).toHaveBeenCalledTimes(2);
    expect(apiClient.pullChanges).toHaveBeenNthCalledWith(
      1,
      { last_synced: { products: "2026-08-15T00:00:00Z" }, page_offset: {} },
      false,
      false,
    );
    expect(apiClient.pullChanges).toHaveBeenNthCalledWith(
      2,
      { last_synced: { products: "2026-08-15T00:00:00Z" }, page_offset: { products: 2 } },
      false,
      false,
    );

    expect(result.pulled).toBe(3);

    const rows = db.exec(`SELECT id FROM products ORDER BY id`);
    expect(rows[0].values.map((r) => r[0])).toEqual(["prod-1", "prod-2", "prod-3"]);

    const cursor = db.exec(
      `SELECT last_synced_at FROM _sync_state WHERE table_name = 'products'`,
    );
    expect(cursor[0].values[0][0]).toBe("2026-09-01T00:00:02Z");
  });

  it("does not advance the cursor at all if the round never finishes (has_more stays true up to the page cap)", async () => {
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('products', '2026-08-15T00:00:00Z')`,
    );

    apiClient.pullChanges.mockResolvedValue({
      success: true,
      changes: { products: [makeProductStub()] },
      server_timestamp: "2026-09-01T00:00:01Z",
      has_more: { products: true },
    });

    function makeProductStub() {
      return {
        id: `prod-${Math.random()}`,
        name: "Product",
        selling_price: 100,
        updated_at: "2026-09-01T00:00:00Z",
        _version: 1,
      };
    }

    await pullChanges();

    const cursor = db.exec(
      `SELECT last_synced_at FROM _sync_state WHERE table_name = 'products'`,
    );
    // Cursor must stay at its original value — never advanced to
    // server_timestamp — since the table's backlog was never fully drained.
    expect(cursor[0].values[0][0]).toBe("2026-08-15T00:00:00Z");
  });
});

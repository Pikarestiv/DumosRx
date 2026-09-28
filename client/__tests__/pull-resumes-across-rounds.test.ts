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
 * Regression test for docs/KNOWN_BUGS.md A-1: a pull round that did not drain
 * a table's whole backlog threw away every page of progress it had made, so
 * the next sync() restarted from the same window forever. Per-table progress
 * is now persisted into `_sync_state.server_cursor` after each committed
 * page, and the next round resumes from it.
 */
describe("pullChanges resumes an unfinished table across sync rounds", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn> };

  const makeProduct = (n: number, updatedAt = "2026-09-01T00:00:00.000000Z") => ({
    id: `prod-${n}`,
    name: `Product ${n}`,
    selling_price: 100,
    updated_at: updatedAt,
    _version: 1,
  });

  const syncStateRow = () => {
    const res = db.exec(
      `SELECT last_synced_at, server_cursor FROM _sync_state WHERE table_name = 'products'`,
    );
    if (!res.length) return null;
    return {
      last_synced_at: res[0].values[0][0] as string | null,
      server_cursor: res[0].values[0][1] as string | null,
    };
  };

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
    db.run(`DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM products;`);
    db.run(
      `INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('products', '2026-08-15T00:00:00Z')`,
    );
    vi.clearAllMocks();
  });

  it("persists each committed page's keyset position and resumes from it on the next round", async () => {
    apiClient.pullChanges
      .mockResolvedValueOnce({
        success: true,
        changes: { products: [makeProduct(1), makeProduct(2)] },
        server_timestamp: "2026-09-01T00:00:01Z",
        has_more: { products: true },
      })
      .mockRejectedValueOnce(new Error("Network request failed"));

    await expect(pullChanges()).rejects.toThrow();

    const afterFirstRound = syncStateRow();
    // The delta window itself must NOT move — the backlog is not drained.
    expect(afterFirstRound?.last_synced_at).toBe("2026-08-15T00:00:00Z");
    // ...but the position reached within that window must survive the round.
    expect(JSON.parse(afterFirstRound?.server_cursor as string)).toEqual({
      updated_at: "2026-09-01T00:00:00.000000Z",
      id: "prod-2",
    });

    apiClient.pullChanges.mockReset();
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { products: [makeProduct(3)] },
      server_timestamp: "2026-09-01T00:00:05Z",
      has_more: { products: false },
    });

    await pullChanges();

    // The resumed round asks the server to seek past prod-2 rather than
    // re-fetching the window from the beginning.
    expect(apiClient.pullChanges).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        last_synced: { products: "2026-08-15T00:00:00Z" },
        page_cursor: {
          products: { updated_at: "2026-09-01T00:00:00.000000Z", id: "prod-2" },
        },
      }),
      false,
      false,
      undefined,
    );

    const afterSecondRound = syncStateRow();
    expect(afterSecondRound?.last_synced_at).toBe("2026-09-01T00:00:05Z");
    // A drained table carries no in-progress position any more.
    expect(afterSecondRound?.server_cursor).toBeNull();
  });

  it("does not persist progress past a record skipped for a pending local edit", async () => {
    db.run(
      `INSERT INTO products (id, name, selling_price) VALUES ('prod-1', 'Local edit', 1)`,
    );
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, created_at)
       VALUES ('products', 'prod-1', 'UPDATE', '2026-09-01T00:00:00Z')`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { products: [makeProduct(1), makeProduct(2)] },
      server_timestamp: "2026-09-01T00:00:01Z",
      has_more: { products: true },
    }).mockRejectedValueOnce(new Error("Network request failed"));

    await expect(pullChanges()).rejects.toThrow();

    const state = syncStateRow();
    expect(state?.last_synced_at).toBe("2026-08-15T00:00:00Z");
    expect(state?.server_cursor).toBeNull();
  });
});

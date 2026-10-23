import { describe, it, expect, beforeAll, vi } from "vitest";
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

describe("pull.ts against a refused X-Store-Id (A-254)", () => {
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

  it("stamps a window only for the tables the response carried, so withheld tables stay unsynced", async () => {
    core.setActiveStoreId("revoked-store");
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: { stores: [{ id: "owned-store", name: "Owned", _version: 1 }] },
      has_more: { stores: false },
      server_timestamp: "2026-10-23T00:00:00Z",
      refused_store_id: "revoked-store",
    });

    try {
      await pullChanges();

      const stamped = db.exec(`SELECT table_name FROM _sync_state WHERE last_synced_at IS NOT NULL`);
      expect(stamped[0]?.values.map((row) => row[0]) ?? []).toEqual(["stores"]);
    } finally {
      core.setActiveStoreId(null);
    }
  });
});

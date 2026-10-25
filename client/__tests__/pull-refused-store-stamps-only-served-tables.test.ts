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

  beforeEach(() => {
    db.run(`DELETE FROM _sync_state`);
    vi.clearAllMocks();
  });

  function refusedPage(refusedStoreId: string) {
    return {
      success: true,
      changes: { stores: [{ id: "owned-store", name: "Owned", _version: 1 }] },
      has_more: { stores: false },
      server_timestamp: "2026-10-23T00:00:00Z",
      refused_store_id: refusedStoreId,
    };
  }

  function windows(storeId: string): unknown[] {
    const rows = db.exec(`SELECT table_name FROM _sync_state WHERE store_id = ? ORDER BY table_name`, [storeId]);
    return rows[0]?.values.map((row) => row[0]) ?? [];
  }

  it("clears a window an earlier empty pull already stamped for the refused store", async () => {
    db.run(`INSERT INTO _sync_state (store_id, table_name, last_synced_at) VALUES ('revoked-store', 'products', '2026-10-01T00:00:00Z')`);
    core.setActiveStoreId("revoked-store");
    apiClient.pullChanges.mockResolvedValueOnce(refusedPage("revoked-store"));

    try {
      await pullChanges();
      expect(windows("revoked-store")).toEqual(["stores"]);
    } finally {
      core.setActiveStoreId(null);
    }
  });

  it("leaves the windows alone when the refusal names a store this run did not ask for", async () => {
    db.run(`INSERT INTO _sync_state (store_id, table_name, last_synced_at) VALUES ('active-store', 'products', '2026-10-01T00:00:00Z')`);
    core.setActiveStoreId("active-store");
    apiClient.pullChanges.mockResolvedValueOnce(refusedPage("some-other-store"));

    try {
      await pullChanges();
      expect(windows("active-store")).toEqual(["products", "stores"]);
    } finally {
      core.setActiveStoreId(null);
    }
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

  it("reports the refusal with the live stores the server still serves, so the device can offer a way back (A-323)", async () => {
    core.setActiveStoreId("revoked-store");
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [
          { id: "revoked-store", name: "Revoked", _version: 2, deleted_at: "2026-10-20T00:00:00Z" },
          { id: "owned-store", name: "Owned", _version: 1 },
          { id: "closed-store", name: "Closed", _version: 3, _deleted: true },
        ],
      },
      has_more: { stores: false },
      server_timestamp: "2026-10-23T00:00:00Z",
      refused_store_id: "revoked-store",
    });

    try {
      const result = await pullChanges();
      expect(result.refusal).toEqual({ storeId: "revoked-store", accessibleStores: [{ id: "owned-store", name: "Owned" }] });
    } finally {
      core.setActiveStoreId(null);
    }
  });

  it("reports no refusal when the refused store is not the one this run asked for", async () => {
    core.setActiveStoreId("active-store");
    apiClient.pullChanges.mockResolvedValueOnce(refusedPage("some-other-store"));

    try {
      expect((await pullChanges()).refusal).toBeUndefined();
    } finally {
      core.setActiveStoreId(null);
    }
  });
});

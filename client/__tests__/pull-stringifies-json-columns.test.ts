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
 * Regression test (final review, Critical C1): the server pulls
 * permission_groups.permissions as a real JSON array (Eloquent's `array`
 * cast), but pull.ts's value-normalization only special-cased booleans -
 * an array/object bound straight into sql.js's statement.bind() is
 * silently mis-serialized as an object of numeric keys (e.g.
 * `{"0":0,"1":0}`), not the JSON string every reader downstream
 * (getStorePermissionGroups, getUserPermissionGroup) expects to
 * JSON.parse(). This defeats the feature on every device that RECEIVES a
 * group via sync rather than creating it locally.
 */
describe("pullChanges stringifies array/object columns before writing them", () => {
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
    db.run(`DELETE FROM _sync_state; DELETE FROM permission_groups; DELETE FROM stores;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    vi.clearAllMocks();
  });

  it("stores a pulled permission_groups.permissions array as valid JSON, not a corrupted object", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        permission_groups: [
          {
            id: "pg1",
            store_id: "store1",
            name: "Manager",
            based_on_role: "manager",
            is_default: true,
            // The real shape a Laravel `array`-cast attribute serializes
            // to in the pull JSON response - a genuine array, not a
            // pre-stringified value.
            permissions: ["process_sales", "manage_staff"],
            _version: 1,
          },
        ],
      },
      server_timestamp: "2026-09-27T00:00:00Z",
    });

    await pullChanges();

    const rows = await core.query<{ permissions: string }>(
      `SELECT permissions FROM permission_groups WHERE id = 'pg1'`,
    );
    expect(rows).toHaveLength(1);
    expect(() => JSON.parse(rows[0].permissions)).not.toThrow();
    expect(JSON.parse(rows[0].permissions)).toEqual(["process_sales", "manage_staff"]);
  });
});

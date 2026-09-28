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
 * A-12. `stores.last_monotonic_time` anchors the offline clock-tamper guard
 * (licensing-manager.ts refuses a local time earlier than the last recorded
 * action). It is written by a raw local `execute` (queries/setup.ts's
 * updateStoreMonotonicTime) and never pushed, so the server's copy of the
 * column is permanently NULL — and the pull, which writes back every column
 * the server returns, wrote that NULL over the local anchor on every single
 * sync round, re-arming the guard from whatever the clock currently says.
 */
describe("pullChanges preserves device-local columns", () => {
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
    db.run(`DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM stores;`);
    vi.clearAllMocks();
  });

  it("keeps the local stores.last_monotonic_time when the server's copy is NULL", async () => {
    db.run(
      `INSERT INTO stores (id, name, last_monotonic_time, _deleted, _version)
       VALUES ('store-1', 'Main Branch', '2026-09-28T10:00:00.000Z', 0, 1)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [
          {
            id: "store-1",
            name: "Main Branch Renamed",
            last_monotonic_time: null,
            _version: 2,
          },
        ],
      },
      server_timestamp: "2026-09-28T12:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(
      `SELECT last_monotonic_time, name FROM stores WHERE id = 'store-1'`,
    );
    expect(rows[0].values[0][0]).toBe("2026-09-28T10:00:00.000Z");
    // The rest of the pulled row still applies — this exclusion is
    // column-scoped, not a blanket skip of the stores table.
    expect(rows[0].values[0][1]).toBe("Main Branch Renamed");
  });

  it("does not let another device's clock propagate a future monotonic time", async () => {
    db.run(
      `INSERT INTO stores (id, name, last_monotonic_time, _deleted, _version)
       VALUES ('store-2', 'Second Branch', '2026-09-28T10:00:00.000Z', 0, 1)`,
    );

    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [
          {
            id: "store-2",
            name: "Second Branch",
            last_monotonic_time: "2030-01-01T00:00:00.000Z",
            _version: 2,
          },
        ],
      },
      server_timestamp: "2026-09-28T12:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(
      `SELECT last_monotonic_time FROM stores WHERE id = 'store-2'`,
    );
    expect(rows[0].values[0][0]).toBe("2026-09-28T10:00:00.000Z");
  });

  it("does not write a device-local column when the pull INSERTs a store row this device has never seen", async () => {
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [
          {
            id: "store-3",
            name: "New Branch",
            last_monotonic_time: "2030-01-01T00:00:00.000Z",
            _version: 1,
          },
        ],
      },
      server_timestamp: "2026-09-28T12:00:00Z",
    });

    await pullChanges();

    const rows = db.exec(
      `SELECT last_monotonic_time FROM stores WHERE id = 'store-3'`,
    );
    expect(rows[0].values[0][0]).toBeNull();
  });
});

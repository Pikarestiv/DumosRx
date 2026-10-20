import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const pullChangesMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    pullChanges: (...args: unknown[]) => pullChangesMock(...args),
  },
}));

// A-305. `_sync_state` was keyed by `table_name` alone, so one watermark served every store a device held, and nothing res…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-pull-watermark-is-per-store-test-ts-L16
describe("the pull watermark belongs to one store", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pullChanges } = await import("@/lib/db/sync-engine/pull"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM _sync_state; DELETE FROM products;`);
    pullChangesMock.mockReset();
    pullChangesMock.mockResolvedValue({
      success: true,
      changes: {},
      server_timestamp: "2026-10-19T12:00:00Z",
    });
  });

  afterEach(() => {
    core.setActiveStoreId(null);
  });

  const lastSyncedSent = () => pullChangesMock.mock.calls[0][0].last_synced;

  it("does not hand store A's watermark to a pull for store B", async () => {
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at)
       VALUES ('store-a', 'sales', '2026-10-19T11:00:00Z')`,
    );

    core.setActiveStoreId("store-b");
    await pullChanges();

    // Store B has never synced `sales`, so it must ask for everything.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-pull-watermark-is-per-store-test-ts-L71
    expect(lastSyncedSent().sales).toBeUndefined();
  });

  it("still uses a store's own watermark", async () => {
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at)
       VALUES ('store-a', 'sales', '2026-10-19T11:00:00Z'),
              ('store-b', 'sales', '2026-10-18T09:00:00Z')`,
    );

    core.setActiveStoreId("store-b");
    await pullChanges();

    expect(lastSyncedSent().sales).toBe("2026-10-18T09:00:00Z");
  });

  it("advances only the syncing store's watermark", async () => {
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at)
       VALUES ('store-a', 'sales', '2026-10-19T11:00:00Z')`,
    );

    core.setActiveStoreId("store-b");
    await pullChanges();

    const untouched = db.exec(
      `SELECT last_synced_at FROM _sync_state WHERE store_id = 'store-a' AND table_name = 'sales'`,
    );
    expect(untouched[0].values[0][0]).toBe("2026-10-19T11:00:00Z");
  });
});

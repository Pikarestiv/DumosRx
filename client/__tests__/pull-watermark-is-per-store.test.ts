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

/**
 * A-305. `_sync_state` was keyed by `table_name` alone, so one watermark
 * served every store a device held, and nothing reset it on a switch. A device
 * that spent a week on store A advanced every table's watermark to "now"; on
 * switching to B the pull asked for B's rows changed since *now*, and
 * everything B changed that week was never delivered — while every watermark
 * read perfectly current, which is why nothing looked wrong.
 *
 * Measured on production 2026-10-19: 17 undelivered `sales`, 518
 * `sale_items`, 520 `sale_item_batches`, 520 `stock_movements` on one
 * two-store device, unchanged across nine syncs over three hours.
 */
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

    // Store B has never synced `sales`, so it must ask for everything. With a
    // shared watermark it would have asked for changes since 11:00 and never
    // received anything store A's week of syncing had already advanced past.
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

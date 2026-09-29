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
 * The `stores` prune soft-deletes a live local store the pull response's
 * `stores` list omits, on the premise that the server always answers with a
 * complete snapshot of every store the ACCOUNT owns. Two situations break
 * that premise, and both end with a store vanishing from the switcher on a
 * device that had it:
 *
 *  - The snapshot is scoped to the authenticated identity, not the account:
 *    `SyncController::resolvePullTenantScope()` narrows `$ownedStoreIds` to
 *    `[$user->store_id]` for any user carrying a store_id (every staff
 *    account). A pull on a staff session therefore legitimately returns one
 *    store, and pruning against it deletes the owner's other stores.
 *  - A pruned store with a pending `_sync_queue` row can never come back:
 *    the pull's own pending-local-edit rule skips re-applying that row, so
 *    the `_deleted = 1` the prune wrote is never cleared by a later,
 *    correctly-scoped pull.
 *
 * The prune must fail closed in both cases — a stale entry lingering in the
 * switcher is the error direction this code already prefers.
 */
describe("pull.ts store prune fails closed when the snapshot may not be account-wide", () => {
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
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE sales ADD COLUMN store_id TEXT;`);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stores; DELETE FROM products; DELETE FROM sales; DELETE FROM _sync_state; DELETE FROM _sync_queue;`,
    );
    localStorage.clear();
    vi.clearAllMocks();
  });

  const twoLocalStores = () =>
    db.run(
      `INSERT INTO stores (id, name, _deleted) VALUES ('store-a', 'Store A', 0), ('store-b', 'Store B', 0)`,
    );

  const snapshotWithOnlyStoreA = () =>
    apiClient.pullChanges.mockResolvedValueOnce({
      success: true,
      changes: {
        stores: [{ id: "store-a", name: "Store A", _version: 1 }],
      },
      server_timestamp: "2026-09-29T00:00:00Z",
    });

  const storeBDeleted = () =>
    db.exec(`SELECT _deleted FROM stores WHERE id = 'store-b'`)[0].values[0][0];

  it("does not prune when the signed-in identity is staff-scoped", async () => {
    twoLocalStores();
    localStorage.setItem(
      "dumos_user",
      JSON.stringify({ id: "user-1", role: "sales_staff", store_id: "store-a" }),
    );
    snapshotWithOnlyStoreA();

    await pullChanges();

    expect(storeBDeleted()).toBe(0);
  });

  it("does not prune a store that still has an unpushed local edit queued", async () => {
    twoLocalStores();
    localStorage.setItem(
      "dumos_user",
      JSON.stringify({ id: "owner-1", role: "store_owner" }),
    );
    db.run(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('stores', 'store-b', 'UPDATE', '{"id":"store-b"}', '2026-09-29T00:00:00Z')`,
    );
    snapshotWithOnlyStoreA();

    await pullChanges();

    expect(storeBDeleted()).toBe(0);
  });

  it("still prunes a genuinely absent store for an account-wide owner snapshot", async () => {
    twoLocalStores();
    localStorage.setItem(
      "dumos_user",
      JSON.stringify({ id: "owner-1", role: "store_owner", store_id: null }),
    );
    snapshotWithOnlyStoreA();

    await pullChanges();

    expect(storeBDeleted()).toBe(1);
  });
});

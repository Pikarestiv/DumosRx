import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("online listing count and capped bulk publishing", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let visibility: typeof import("@/lib/db/queries/product-visibility");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    visibility = await import("@/lib/db/queries/product-visibility");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM _sync_queue;`);
    core.setActiveStoreId("store-1");
  });

  function seed(id: string, showOnline: number, storeId = "store-1", deleted = 0) {
    db.run(
      `INSERT INTO products (id, name, selling_price, show_online, store_id, _deleted) VALUES (?, ?, 100, ?, ?, ?)`,
      [id, id, showOnline, storeId, deleted],
    );
  }

  const listed = () => db.exec(`SELECT COUNT(*) FROM products WHERE show_online = 1 AND store_id = 'store-1'`)[0].values[0][0];

  it("counts only this store's listed, undeleted products", async () => {
    seed("a", 1);
    seed("b", 1);
    seed("hidden", 0);
    seed("gone", 1, "store-1", 1);
    seed("elsewhere", 1, "store-2");

    expect(await visibility.countListedProducts()).toBe(2);
  });

  it("publishes no more than the slots left", async () => {
    seed("listed", 1);
    seed("x", 0);
    seed("y", 0);
    seed("z", 0);

    expect(await visibility.setProductsShowOnline(true, undefined, 2)).toBe(2);
    expect(listed()).toBe(3);
  });

  it("publishes nothing once there are no slots left", async () => {
    seed("x", 0);

    expect(await visibility.setProductsShowOnline(true, undefined, 0)).toBe(0);
    expect(listed()).toBe(0);
  });

  it("is unlimited without a slot count and never limits hiding", async () => {
    seed("x", 0);
    seed("y", 0);
    expect(await visibility.setProductsShowOnline(true)).toBe(2);

    expect(await visibility.setProductsShowOnline(false, undefined, 0)).toBe(2);
    expect(listed()).toBe(0);
  });
});

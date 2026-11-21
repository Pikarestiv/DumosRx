import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));

const STORE_ID = "store-1";

describe("getProductsWithDetails: missing_expiry_batches", () => {
  let db: Database;
  let getProductsWithDetails: typeof import("@/lib/db/queries/products").getProductsWithDetails;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ getProductsWithDetails } = await import("@/lib/db/queries/products"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stock_batches; DELETE FROM products;`);
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('p1', 'Amoxil', 0, '${STORE_ID}'), ('p2', 'Panadol', 0, '${STORE_ID}')`);
  });

  const batch = (id: string, product: string, quantity: number, expiry: string | null, deleted = 0) =>
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, expiry_date, is_active, _deleted, store_id)
       VALUES (?, ?, ?, ?, 100, ?, 1, ?, '${STORE_ID}')`,
      [id, product, id, quantity, expiry, deleted],
    );

  const countFor = async (productId: string) =>
    Number((await getProductsWithDetails()).find((p) => p.id === productId)?.missing_expiry_batches);

  it("counts the stocked batches with no expiry, the same way the action center's total does", async () => {
    batch("a", "p1", 5, null);
    batch("b", "p1", 3, "");
    batch("c", "p1", 9, "2027-01-01");
    batch("d", "p1", 0, null);
    batch("e", "p1", 4, null, 1);

    expect(await countFor("p1")).toBe(2);
    expect(await countFor("p2")).toBe(0);
  });
});

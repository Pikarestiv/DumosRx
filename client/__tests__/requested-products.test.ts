import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises logRequestedProduct()/getRequestedProducts() against a genuine
 * in-memory SQLite engine (sql.js), not a mocked query() — the dedup/merge
 * logic in logRequestedProduct (case-insensitive name match, incrementing
 * request_count, merging customer names and notes without duplicating them)
 * is exactly the kind of business logic a mock can't verify.
 */
describe("requested-products-queries.ts", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let logRequestedProduct: typeof import("@/lib/db/requested-products-queries").logRequestedProduct;
  let getRequestedProducts: typeof import("@/lib/db/requested-products-queries").getRequestedProducts;
  let markRequestedProductAsOrdered: typeof import("@/lib/db/requested-products-queries").markRequestedProductAsOrdered;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const mod = await import("@/lib/db/requested-products-queries");
    logRequestedProduct = mod.logRequestedProduct;
    getRequestedProducts = mod.getRequestedProducts;
    markRequestedProductAsOrdered = mod.markRequestedProductAsOrdered;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM requested_products;`);
  });

  it("creates a new pending request with count 1 the first time a product is requested", async () => {
    await logRequestedProduct("Panadol Extra", "Jane", 2, "Needs it urgently");

    const rows = await getRequestedProducts("all");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      product_name: "Panadol Extra",
      requested_by_customer: "Jane",
      request_count: 1,
      quantity: 2,
      notes: "Needs it urgently",
      status: "pending",
    });
  });

  it("increments the existing pending request instead of creating a duplicate (case-insensitive match)", async () => {
    await logRequestedProduct("Panadol Extra", "Jane", 2);
    await logRequestedProduct("panadol extra", "Bob", 3);

    const rows = await getRequestedProducts("all");
    expect(rows).toHaveLength(1);
    expect(rows[0].request_count).toBe(2);
    expect(rows[0].quantity).toBe(5); // 2 + 3
  });

  it("appends new customer names to the existing list without duplicating a name already present", async () => {
    await logRequestedProduct("Loratadine", "Jane");
    await logRequestedProduct("Loratadine", "Bob");
    await logRequestedProduct("Loratadine", "Jane"); // repeat customer — should not duplicate

    const rows = await getRequestedProducts("all");
    expect(rows[0].requested_by_customer).toBe("Jane, Bob");
  });

  it("appends new notes without duplicating an identical note", async () => {
    await logRequestedProduct("Loratadine", "Jane", 1, "Out of stock everywhere");
    await logRequestedProduct("Loratadine", "Bob", 1, "Out of stock everywhere");
    await logRequestedProduct("Loratadine", "Ann", 1, "Prefers the syrup form");

    const rows = await getRequestedProducts("all");
    expect(rows[0].notes).toBe("Out of stock everywhere | Prefers the syrup form");
  });

  it("does NOT merge into a request that's already been marked ordered — opens a fresh pending one instead", async () => {
    const firstId = await logRequestedProduct("Amoxicillin", "Jane", 1);
    await markRequestedProductAsOrdered(firstId);

    await logRequestedProduct("Amoxicillin", "Bob", 1);

    const rows = await getRequestedProducts("all");
    expect(rows).toHaveLength(2);
    const pending = rows.find((r) => r.status === "pending");
    expect(pending?.requested_by_customer).toBe("Bob");
    expect(pending?.request_count).toBe(1);
  });

  it("getRequestedProducts filters by status and sorts by request_count desc, then created_at desc", async () => {
    await logRequestedProduct("Low demand item", "A");
    await logRequestedProduct("High demand item", "B");
    await logRequestedProduct("High demand item", "C"); // bumps request_count to 2

    const pending = await getRequestedProducts("pending");
    expect(pending.map((r) => r.product_name)).toEqual(["High demand item", "Low demand item"]);

    const orderedOnly = await getRequestedProducts("ordered");
    expect(orderedOnly).toHaveLength(0);
  });
});

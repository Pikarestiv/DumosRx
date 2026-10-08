import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));
vi.mock("../lib/query-client", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

/**
 * createProduct() uses a UUID test to decide whether `category_id` holds an
 * id or a free-text category NAME. Its pattern accepted only UUID v1-v5,
 * while Laravel's HasUuids emits v7 — so a server-created category id fell
 * down the name branch and the function created a brand new category
 * *literally named after the UUID*, filing the product under it.
 *
 * Reachable in production the moment A-189's repair created a category
 * server-side for store 571582a9. Same root cause as A-192's push guard;
 * both now share lib/utils/uuid.ts.
 */
const SERVER_V7_CATEGORY_ID = "01a11c6e-12dc-72a6-bc2c-cd1c32d206b9";

describe("createProduct with a server-generated UUID v7 category", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let createProduct: typeof import("@/lib/db/local-database").createProduct;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ createProduct } = await import("@/lib/db/local-database"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM categories; DELETE FROM _sync_queue;`);
    db.run(
      `INSERT INTO categories (id, name, _deleted) VALUES ('${SERVER_V7_CATEGORY_ID}', 'soap', 0)`,
    );
  });

  it("files the product under the existing category instead of inventing one named after the id", async () => {
    await createProduct({
      name: "CARO WHITE SOAP",
      category_id: SERVER_V7_CATEGORY_ID,
      selling_price: 2000,
    } as Parameters<typeof createProduct>[0]);

    const cats = db.exec(`SELECT id, name FROM categories ORDER BY name`);
    expect(cats[0].values).toHaveLength(1);
    expect(cats[0].values[0][1]).toBe("soap");

    const product = db.exec(`SELECT category_id FROM products WHERE name = 'caro white soap' COLLATE NOCASE`);
    expect(product[0].values[0][0]).toBe(SERVER_V7_CATEGORY_ID);
  });

  it("still resolves a real category name to its id", async () => {
    await createProduct({
      name: "CARO WHITE LOTION",
      category_id: "soap",
      selling_price: 3000,
    } as Parameters<typeof createProduct>[0]);

    const cats = db.exec(`SELECT id FROM categories`);
    expect(cats[0].values).toHaveLength(1);

    const product = db.exec(`SELECT category_id FROM products WHERE name = 'caro white lotion' COLLATE NOCASE`);
    expect(product[0].values[0][0]).toBe(SERVER_V7_CATEGORY_ID);
  });

  it("still creates a category for a genuinely new name", async () => {
    await createProduct({
      name: "NEW ITEM",
      category_id: "toiletries",
      selling_price: 500,
    } as Parameters<typeof createProduct>[0]);

    const cats = db.exec(`SELECT name FROM categories ORDER BY name`);
    expect(cats[0].values.map((r) => r[0])).toEqual(["soap", "toiletries"]);
  });
});

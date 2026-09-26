import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

import {
  detectColumnMapping,
  mapRowToProduct,
  parseBooleanValue,
} from "@/lib/utils/product-import-export";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * `products.show_online` defaults off and the importer handled the column not
 * at all, so a store that imported hundreds of products and enabled its online
 * store got an empty storefront with no bulk way out (docs/STOREFRONT_REVIEW.md,
 * feature #7).
 */
describe("show_online column mapping", () => {
  it("auto-detects the spellings a store owner's own export uses", () => {
    const mapping = detectColumnMapping([
      "Product Name",
      "Show in Online Store",
    ]);
    expect(mapping["Show in Online Store"]).toBe("show_online");
  });

  it("auto-detects the shorter spellings", () => {
    expect(detectColumnMapping(["Show Online"])["Show Online"]).toBe("show_online");
    expect(detectColumnMapping(["Sell Online"])["Sell Online"]).toBe("show_online");
  });

  it.each([
    ["Yes", true],
    ["yes", true],
    ["TRUE", true],
    [1, true],
    ["online", true],
    ["No", false],
    ["FALSE", false],
    [0, false],
    ["hidden", false],
  ])("parses %s as %s", (raw, expected) => {
    expect(parseBooleanValue(raw)).toBe(expected);
  });

  it.each([[""], [null], [undefined], ["maybe"], ["¯\\_(ツ)_/¯"]])(
    "leaves %s undefined rather than guessing a public-visibility change",
    (raw) => {
      expect(parseBooleanValue(raw)).toBeUndefined();
    },
  );

  it("maps a row's show_online cell onto showOnline", () => {
    const mapping = { Name: "name", Online: "show_online" } as const;
    expect(mapRowToProduct({ Name: "Panadol", Online: "Yes" }, { ...mapping })?.showOnline).toBe(true);
    expect(mapRowToProduct({ Name: "Panadol", Online: "No" }, { ...mapping })?.showOnline).toBe(false);
    expect(mapRowToProduct({ Name: "Panadol", Online: "" }, { ...mapping })?.showOnline).toBeUndefined();
  });
});

describe("importProductRows show_online handling", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let importProductRows: typeof import("@/lib/db/queries/product-import").importProductRows;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ importProductRows } = await import("@/lib/db/queries/product-import"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM products; DELETE FROM categories; DELETE FROM suppliers;
      DELETE FROM stock_batches; DELETE FROM _sync_queue;
    `);
  });

  const showOnlineFor = (name: string) =>
    db.exec(`SELECT show_online FROM products WHERE name = '${name}'`)[0].values[0][0];

  it("publishes a new product when the file says to", async () => {
    await importProductRows([{ name: "Published", sellingPrice: 100, showOnline: true }]);

    expect(showOnlineFor("published")).toBe(1);
  });

  it("leaves a new product unpublished when the column is absent", async () => {
    await importProductRows([{ name: "Quiet", sellingPrice: 100 }]);

    expect(showOnlineFor("quiet")).toBe(0);
  });

  it("updates an existing product's visibility", async () => {
    await importProductRows([{ name: "Togglable", sellingPrice: 100 }]);
    expect(showOnlineFor("togglable")).toBe(0);

    const result = await importProductRows([
      { name: "Togglable", sellingPrice: 100, showOnline: true },
    ]);

    expect(result.updated).toBe(1);
    expect(showOnlineFor("togglable")).toBe(1);
  });

  it("leaves an existing product's visibility alone when the column is absent", async () => {
    await importProductRows([{ name: "Keeper", sellingPrice: 100, showOnline: true }]);

    await importProductRows([{ name: "Keeper", sellingPrice: 250 }]);

    expect(showOnlineFor("keeper")).toBe(1);
  });
});

describe("setProductsShowOnline", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let setProductsShowOnline: typeof import("@/lib/db/queries/product-visibility").setProductsShowOnline;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ setProductsShowOnline } = await import("@/lib/db/queries/product-visibility"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM _sync_queue;`);
    core.setActiveStoreId(null);
  });

  function seed(id: string, showOnline: number | null, storeId: string | null = null) {
    db.run(
      `INSERT INTO products (id, name, selling_price, show_online, store_id, _deleted) VALUES (?, ?, 100, ?, ?, 0)`,
      [id, id, showOnline, storeId],
    );
  }

  const showOnlineFor = (id: string) =>
    db.exec(`SELECT show_online FROM products WHERE id = '${id}'`)[0].values[0][0];

  it("publishes every product in the store, skipping the ones already published", async () => {
    seed("a", 0);
    seed("b", null);
    seed("c", 1);

    const changed = await setProductsShowOnline(true);

    expect(changed).toBe(2);
    expect(showOnlineFor("a")).toBe(1);
    expect(showOnlineFor("b")).toBe(1);
  });

  it("only touches the filtered ids when given some", async () => {
    seed("a", 0);
    seed("b", 0);

    const changed = await setProductsShowOnline(true, ["a"]);

    expect(changed).toBe(1);
    expect(showOnlineFor("a")).toBe(1);
    expect(showOnlineFor("b")).toBe(0);
  });

  it("hides products again", async () => {
    seed("a", 1);

    expect(await setProductsShowOnline(false)).toBe(1);
    expect(showOnlineFor("a")).toBe(0);
  });

  it("is scoped to the active store", async () => {
    core.setActiveStoreId("store-1");
    seed("mine", 0, "store-1");
    seed("theirs", 0, "store-2");

    const changed = await setProductsShowOnline(true);

    expect(changed).toBe(1);
    expect(showOnlineFor("mine")).toBe(1);
    expect(showOnlineFor("theirs")).toBe(0);
  });

  it("queues each change for sync", async () => {
    seed("a", 0);
    seed("b", 0);

    await setProductsShowOnline(true);

    const queued = db.exec(`SELECT COUNT(*) FROM _sync_queue WHERE table_name = 'products'`);
    expect(queued[0].values[0][0]).toBe(2);
  });
});

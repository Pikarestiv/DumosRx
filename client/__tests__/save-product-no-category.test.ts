import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression test for a bug found while smoke-testing POS/Inventory
 * (docs/features/pos.md): Add Product's Category field has no "*" in the
 * dialog - it's documented as optional - but saving a product without one
 * always failed with a "Failed to save Product." toast and no row created.
 *
 * Root cause: useSaveProductMutation's mutationFn set
 * `localPayload.category_id = undefined` when no category was given.
 * base-helpers.ts's insert()/update() bind every payload value straight into
 * a sql.js prepared statement with no null-coalescing, and sql.js's bind()
 * throws ("Wrong API use: tried to bind a value of an unknown type
 * (undefined)") on a JS `undefined` - it only accepts `null` for an absent
 * column. This is a real in-memory SQLite run against the app's actual
 * SCHEMA_SQL (not a mocked insert), so it reproduces the exact throw the
 * live app hit, confirmed live in Chrome before this fix.
 */
describe("useSaveProductMutation — no category selected", () => {
  let db: Database;
  let saveProduct: typeof import("@/lib/hooks/use-save-product-mutation").saveProductToLocalDb;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);

    const mutationModule = await import("@/lib/hooks/use-save-product-mutation");
    saveProduct = mutationModule.saveProductToLocalDb;
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM categories;`);
  });

  it("saves the product instead of throwing when no category is set", async () => {
    await expect(
      saveProduct({
        name: "Manual UI Test Product XYZ",
        category_id: "", // "Select or type category" left empty, as AddProductDialog sends it
        selling_price: 1500,
        reorder_level: 10,
      }),
    ).resolves.toEqual({ isEditing: false });

    const rows = db.exec(
      "SELECT name, category_id FROM products WHERE name = 'Manual UI Test Product XYZ'",
    );
    expect(rows[0]?.values.length).toBe(1);
    expect(rows[0]?.values[0]?.[1]).toBeNull();
  });
});

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Regression test for a bug found while smoke-testing POS/Inventory (docs/features/pos.md):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-save-product-no-category-test-ts-L9
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
      // Product names are normalized to lowercase on write (see withNormalizedName in base-helpers.ts) — match on that, not the…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-save-product-no-category-test-ts-L58
      "SELECT name, category_id FROM products WHERE name = 'manual ui test product xyz'",
    );
    expect(rows[0]?.values.length).toBe(1);
    expect(rows[0]?.values[0]?.[1]).toBeNull();
  });
});

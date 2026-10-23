import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import type { ToolContext } from "@/lib/assistant/types";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("assistant inventory tools", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let productStockTool: typeof import("@/lib/assistant/tools/inventory-tools").productStockTool;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const tools = await import("@/lib/assistant/tools/inventory-tools");
    productStockTool = tools.productStockTool;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    core.setActiveStoreId(null);
    db.run(`DELETE FROM stock_batches; DELETE FROM products;`);
    db.run(`INSERT INTO products (id, name, generic_name, reorder_level, selling_price, created_at, updated_at)
            VALUES ('p1', 'Paracetamol 500mg', 'Paracetamol', 10, 250, '2026-01-01', '2026-01-01')`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, created_at, updated_at)
            VALUES ('b1', 'p1', 25, '2026-01-01', '2026-01-01')`);
  });

  const ctx: ToolContext = {
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: [] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k: string) => k,
    now: new Date(2026, 8, 29),
  };

  it("finds an exact-match product and reports its stock", async () => {
    const result = await productStockTool.execute({ product: "Paracetamol 500mg" }, ctx);
    const reply = productStockTool.format(result, { product: "Paracetamol 500mg" }, ctx);
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("25");
  });

  it("returns a not-found reply when nothing matches", async () => {
    const result = await productStockTool.execute({ product: "Nonexistent Drug XYZ" }, ctx);
    const reply = productStockTool.format(result, { product: "Nonexistent Drug XYZ" }, ctx);
    expect(reply.kind).toBe("fallback");
  });

  const seedLowStockProduct = () => {
    db.run(`INSERT INTO products (id, name, reorder_level, selling_price, created_at, updated_at)
            VALUES ('p2', 'Amoxicillin 250mg', 20, 400, '2026-01-01', '2026-01-01')`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, created_at, updated_at)
            VALUES ('b2', 'p2', 3, 100, '2026-01-01', '2026-01-01')`);
  };

  const unprivilegedCtx: ToolContext = {
    ...ctx,
    user: { id: "u2", role: "sales_staff" },
    permissionGroup: { permissions: [] },
  };

  it("reports low-stock and expiring counts without cost value for a role lacking view_cost_fields", async () => {
    seedLowStockProduct();
    const { inventoryStatusTool } = await import("@/lib/assistant/tools/inventory-tools");
    const result = await inventoryStatusTool.execute({}, unprivilegedCtx);
    const reply = inventoryStatusTool.format(result, {}, unprivilegedCtx);
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("1 product(s) low on stock");
    expect(reply.text).toContain("Amoxicillin 250mg");
    expect(reply.text).not.toMatch(/NGN|value/i);
  });

  it("leaves a deactivated product out of both the count and the named list", async () => {
    seedLowStockProduct();
    db.run(`INSERT INTO products (id, name, reorder_level, selling_price, is_active, created_at, updated_at)
            VALUES ('p3', 'Retired Syrup', 15, 300, 0, '2026-01-01', '2026-01-01')`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, created_at, updated_at)
            VALUES ('b3', 'p3', 1, 50, '2026-01-01', '2026-01-01')`);

    const { inventoryStatusTool } = await import("@/lib/assistant/tools/inventory-tools");
    const result = await inventoryStatusTool.execute({}, unprivilegedCtx);
    const reply = inventoryStatusTool.format(result, {}, unprivilegedCtx);

    expect(result.lowStockCount).toBe(1);
    expect(result.lowStockItems.map((i) => i.product)).toEqual(["Amoxicillin 250mg"]);
    expect(reply.text).not.toContain("Retired Syrup");
    expect(reply.text).not.toMatch(/\(of \d+\)/);
  });

  it("includes stock value when the caller has view_cost_fields", async () => {
    seedLowStockProduct();
    const { inventoryStatusTool } = await import("@/lib/assistant/tools/inventory-tools");
    const privilegedCtx: ToolContext = {
      ...unprivilegedCtx,
      permissionGroup: { permissions: ["view_cost_fields"] },
    };
    const result = await inventoryStatusTool.execute({}, privilegedCtx);
    const reply = inventoryStatusTool.format(result, {}, privilegedCtx);
    expect(reply.text).toMatch(/value/i);
  });

  it("answers product_stock with a status word and no number without view_stock_quantities", async () => {
    seedLowStockProduct();
    const inStock = await productStockTool.execute({ product: "Paracetamol 500mg" }, unprivilegedCtx);
    const low = await productStockTool.execute({ product: "Amoxicillin 250mg" }, unprivilegedCtx);

    expect(productStockTool.format(inStock, { product: "Paracetamol 500mg" }, unprivilegedCtx).text).toBe(
      "Paracetamol 500mg: in stock",
    );
    expect(productStockTool.format(low, { product: "Amoxicillin 250mg" }, unprivilegedCtx).text).toBe(
      "Amoxicillin 250mg: low stock",
    );
    expect(JSON.stringify(inStock)).not.toContain("25");
    expect(JSON.stringify(low)).not.toMatch(/"(stock|reorderLevel)":\d/);
  });

  it("answers product_stock with the number for a role holding view_stock_quantities", async () => {
    const withKey: ToolContext = { ...unprivilegedCtx, permissionGroup: { permissions: ["view_stock_quantities"] } };
    const result = await productStockTool.execute({ product: "Paracetamol 500mg" }, withKey);
    expect(productStockTool.format(result, { product: "Paracetamol 500mg" }, withKey).text).toBe(
      "Paracetamol 500mg: 25 in stock (reorder level: 10)",
    );
  });

  it("answers out of stock either way", async () => {
    db.run(`UPDATE stock_batches SET quantity = 0 WHERE id = 'b1'`);
    const result = await productStockTool.execute({ product: "Paracetamol 500mg" }, unprivilegedCtx);
    expect(productStockTool.format(result, { product: "Paracetamol 500mg" }, unprivilegedCtx).text).toBe(
      "Paracetamol 500mg: out of stock",
    );
  });

  it("never prints or carries a per-item quantity in inventory_status", async () => {
    seedLowStockProduct();
    const { inventoryStatusTool } = await import("@/lib/assistant/tools/inventory-tools");
    const result = await inventoryStatusTool.execute({}, ctx);
    const reply = inventoryStatusTool.format(result, {}, ctx);

    expect(result.lowStockItems).toEqual([{ product: "Amoxicillin 250mg" }]);
    expect(reply.text).not.toMatch(/Amoxicillin 250mg[^,.]*\d/);
    expect(reply.text).not.toMatch(/\b3\b/);
  });
});

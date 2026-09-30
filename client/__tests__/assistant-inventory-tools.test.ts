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
});

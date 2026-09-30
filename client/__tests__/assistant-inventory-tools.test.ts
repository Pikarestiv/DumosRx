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
});

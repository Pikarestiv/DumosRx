import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("A-393 product price edit audit logging with previous_price", () => {
  let db: Database;
  let saveProduct: typeof import("@/lib/hooks/use-save-product-mutation").saveProductToLocalDb;
  let applyChangedSellingPrices: typeof import("@/lib/db/procurement-selling-price").applyChangedSellingPrices;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const { makeSqlJsAdapter, runSchemaMigrations } = await import("@/lib/db/schema-migrations");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);

    const saveMutationModule = await import("@/lib/hooks/use-save-product-mutation");
    saveProduct = saveMutationModule.saveProductToLocalDb;

    const procurementModule = await import("@/lib/db/procurement-selling-price");
    applyChangedSellingPrices = procurementModule.applyChangedSellingPrices;
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM products;
      DELETE FROM categories;
      DELETE FROM audit_logs;
      DELETE FROM stores;
      INSERT INTO stores (id, name) VALUES ('store-1', 'Main Store');
    `);
  });

  it("records previous_price in audit_logs when saving an existing product with a changed selling_price", async () => {
    const core = await import("@/lib/db/core");
    const { insert } = await import("@/lib/db/local-database");
    core.setActiveStoreId("store-1");

    await insert("products", {
      id: "prod-1",
      name: "Paracetamol 500mg",
      selling_price: 1000,
      reorder_level: 5,
      store_id: "store-1",
    });

    db.run("DELETE FROM audit_logs");

    await saveProduct({
      id: "prod-1",
      name: "Paracetamol 500mg",
      selling_price: 1500,
      reorder_level: 5,
    });

    const rows = db.exec(
      "SELECT action, details FROM audit_logs WHERE table_name = 'products' AND record_id = 'prod-1' ORDER BY created_at, rowid",
    );
    expect(rows[0]?.values.length).toBe(1);
    const [action, detailsRaw] = rows[0].values[0];
    expect(action).toBe("UPDATE");
    const details = JSON.parse(String(detailsRaw));
    expect(details.selling_price).toBe(1500);
    expect(details.previous_price).toBe(1000);
  });

  it("omits previous_price in audit_logs when saving an existing product without changing selling_price", async () => {
    const core = await import("@/lib/db/core");
    const { insert } = await import("@/lib/db/local-database");
    core.setActiveStoreId("store-1");

    await insert("products", {
      id: "prod-2",
      name: "Amoxicillin 250mg",
      selling_price: 2500,
      reorder_level: 10,
      store_id: "store-1",
    });

    db.run("DELETE FROM audit_logs");

    await saveProduct({
      id: "prod-2",
      name: "Amoxicillin 250mg Caps",
      selling_price: 2500,
      reorder_level: 15,
    });

    const rows = db.exec(
      "SELECT action, details FROM audit_logs WHERE table_name = 'products' AND record_id = 'prod-2' ORDER BY created_at, rowid",
    );
    expect(rows[0]?.values.length).toBe(1);
    const details = JSON.parse(String(rows[0].values[0][1]));
    expect(details.selling_price).toBe(2500);
    expect(details.previous_price).toBeUndefined();
  });

  it("records previous_price in audit_logs when applying changed selling prices from procurement", async () => {
    const core = await import("@/lib/db/core");
    const { insert } = await import("@/lib/db/local-database");
    core.setActiveStoreId("store-1");

    await insert("products", {
      id: "prod-3",
      name: "Cough Syrup",
      selling_price: 1200,
      store_id: "store-1",
    });

    db.run("DELETE FROM audit_logs");

    await applyChangedSellingPrices([
      { product_id: "prod-3", selling_price: 1600, reprice: true },
    ]);

    const rows = db.exec(
      "SELECT action, details FROM audit_logs WHERE table_name = 'products' AND record_id = 'prod-3' ORDER BY created_at, rowid",
    );
    expect(rows[0]?.values.length).toBe(1);
    const details = JSON.parse(String(rows[0].values[0][1]));
    expect(details.selling_price).toBe(1600);
    expect(details.previous_price).toBe(1200);
  });

  it("records previous_price in audit_logs when quick-editing product selling price", async () => {
    const core = await import("@/lib/db/core");
    const { insert } = await import("@/lib/db/local-database");
    const { quickEditProductToLocalDb } = await import("@/lib/hooks/use-product-quick-edit-mutation");
    core.setActiveStoreId("store-1");

    await insert("products", {
      id: "prod-4",
      name: "Ibuprofen 400mg",
      selling_price: 800,
      reorder_level: 20,
      store_id: "store-1",
    });

    db.run("DELETE FROM audit_logs");

    await quickEditProductToLocalDb({
      id: "prod-4",
      sellingPrice: 1100,
    });

    const rows = db.exec(
      "SELECT action, details FROM audit_logs WHERE table_name = 'products' AND record_id = 'prod-4' ORDER BY created_at, rowid",
    );
    expect(rows[0]?.values.length).toBe(1);
    const details = JSON.parse(String(rows[0].values[0][1]));
    expect(details.selling_price).toBe(1100);
    expect(details.previous_price).toBe(800);
  });

  it("records previous_price in audit_logs when updating price during stock audit", async () => {
    const core = await import("@/lib/db/core");
    const { insert } = await import("@/lib/db/local-database");
    const { submitStockAudit } = await import("@/lib/db/queries/inventory");
    core.setActiveStoreId("store-1");

    await insert("products", {
      id: "prod-5",
      name: "Vitamin C 1000mg",
      selling_price: 3000,
      store_id: "store-1",
    });
    await insert("stock_batches", {
      id: "batch-1",
      product_id: "prod-5",
      batch_number: "B1",
      quantity: 10,
      cost_price: 2000,
      store_id: "store-1",
      is_active: 1,
    });

    db.run("DELETE FROM audit_logs");

    await submitStockAudit(
      [
        {
          productId: "prod-5",
          systemQty: 10,
          countedQty: 10,
          systemSellingPrice: 3000,
          countedSellingPrice: 3500,
          systemCostPrice: 2000,
          countedCostPrice: 2000,
          reason: "Repriced during audit",
        },
      ],
      "Auditor",
      "user-1",
    );

    const rows = db.exec(
      "SELECT action, details FROM audit_logs WHERE table_name = 'products' AND record_id = 'prod-5' ORDER BY created_at, rowid",
    );
    expect(rows[0]?.values.length).toBe(1);
    const details = JSON.parse(String(rows[0].values[0][1]));
    expect(details.selling_price).toBe(3500);
    expect(details.previous_price).toBe(3000);
  });
});

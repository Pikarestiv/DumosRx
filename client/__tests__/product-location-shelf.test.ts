import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";

describe("Product location / shelf persistence and PO receipt default", () => {
  let db: Database;
  let saveProductToLocalDb: typeof import("@/lib/hooks/use-save-product-mutation").saveProductToLocalDb;
  let getProductsWithDetails: typeof import("@/lib/db/queries/products").getProductsWithDetails;
  let receivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").receivePurchaseOrder;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ saveProductToLocalDb } = await import("@/lib/hooks/use-save-product-mutation"));
    ({ getProductsWithDetails } = await import("@/lib/db/queries/products"));
    ({ receivePurchaseOrder } = await import("@/lib/db/procurement-receiving"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    for (const table of [
      "products",
      "stock_batches",
      "categories",
      "purchase_orders",
      "purchase_order_items",
      "stock_movements",
      "audit_logs",
    ]) {
      try {
        db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      } catch {
        // Already present on fresh schema
      }
    }
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
    core.setCurrentUser({ id: "owner-1", first_name: "Ada", last_name: "Obi", role: "store_owner" });
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM stock_movements;
      DELETE FROM stock_batches;
      DELETE FROM purchase_order_items;
      DELETE FROM purchase_orders;
      DELETE FROM products;
      DELETE FROM categories;
      DELETE FROM _sync_queue;
    `);
  });

  it("saves location on product create/edit and queues it for sync", async () => {
    await saveProductToLocalDb({
      name: "Glucophage",
      selling_price: 900,
      reorder_level: 10,
      location: "Shelf B2",
      base_unit: "Card",
      units_per_bulk: 60,
      is_active: 1,
    });

    const list = await getProductsWithDetails();
    expect(list).toHaveLength(1);
    expect(list[0].location).toBe("Shelf B2");

    const queued = db.exec(
      `SELECT payload FROM _sync_queue WHERE table_name = 'products' AND record_id = '${list[0].id}'`,
    );
    expect(JSON.parse(String(queued[0].values[0][0])).location).toBe("Shelf B2");

    await saveProductToLocalDb({
      id: list[0].id,
      name: "Glucophage",
      location: "Fridge 1",
    });

    const updated = await getProductsWithDetails();
    expect(updated[0].location).toBe("Fridge 1");
  });

  it("defaults received PO stock_batches.location from the product's location", async () => {
    db.run(`
      INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price, location, _deleted, store_id)
      VALUES ('p1', 'Coartem', 'Card', 'Carton', 10, 900, 'Aisle 3 Shelf C', 0, '${STORE_ID}');
      INSERT INTO purchase_orders (id, status, type, total_amount, payment_status, amount_paid, _deleted, store_id)
      VALUES ('po-1', 'pending', 'immediate', 5000, 'unpaid', 0, 0, '${STORE_ID}');
      INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted, store_id)
      VALUES ('poi-1', 'po-1', 'p1', 1, 0, 10, 5000, 5000, 0, '${STORE_ID}');
    `);

    const status = await receivePurchaseOrder("po-1", [{ po_item_id: "poi-1", quantity: 1 }]);
    expect(status).toBe("received");

    const batchLocation = db.exec(`SELECT location FROM stock_batches WHERE product_id = 'p1'`)[0].values[0][0];
    expect(batchLocation).toBe("Aisle 3 Shelf C");
  });
});

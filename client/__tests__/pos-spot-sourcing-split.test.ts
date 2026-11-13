import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-spot-split-1";

const baseSale = {
  tax: 0,
  discount: 0,
  rawDiscount: 0,
  discountType: "fixed" as const,
  redeemedOption: null,
  selectedCustomer: null,
  canUseLoyaltyProgram: false,
  isResellerSale: false,
  markupType: null,
  resellerCommissionPercentage: 0,
  resellerMarkup: 0,
  resellerCommissionAmount: 0,
  paymentMethod: "cash" as const,
  paymentSplits: [],
  selectedAccountId: "",
  saleNote: "",
  isRefillDispense: false,
  cashierId: "cashier-1",
  earnedPoints: 0,
};

describe("POS Spot Sourcing Split Allocation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let writeSaleTransaction: typeof import("@/lib/hooks/pos-sale-writer").writeSaleTransaction;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ writeSaleTransaction } = await import("@/lib/hooks/pos-sale-writer"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
    localStorage.setItem("dumos_user", JSON.stringify({ id: "cashier-1" }));
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;
      DELETE FROM sale_items; DELETE FROM sale_item_batches; DELETE FROM sales;
      DELETE FROM expenses; DELETE FROM audit_logs;
    `);

    db.run(`INSERT INTO products (id, name, selling_price, _deleted, store_id)
            VALUES ('p2', 'Augmentin 625mg', 3000, 0, '${STORE_ID}')`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, store_id, created_at, updated_at)
       VALUES ('b2', 'p2', 'b2', 5, 2000, 1, 0, '${STORE_ID}', '2026-11-01', '2026-11-01')`,
    );
  });

  it("updateCartSpotSourcing with splitOptions splits line into shelf allocation and external spot-sourced line", async () => {
    const { updateCartSpotSourcing } = await import("@/lib/hooks/use-pos-cart-store");

    const initialItem = {
      id: "p2",
      name: "Augmentin 625mg",
      generic_name: "",
      strength: "",
      unit_price: 3000,
      original_unit_price: 3000,
      stock: 2,
      quantity: 5,
      subtotal: 15000,
      cost_price: 2000,
    };

    const { cart: splitCart } = updateCartSpotSourcing(
      [initialItem],
      "p2",
      {
        isSpotSourced: true,
        sourcingCost: 2400,
        paymentSource: "cash_drawer",
        partner: "City Care Pharmacy",
        quantity: 3,
        sellingPrice: 3000,
      },
      2,
      false,
      false,
      {
        isSplit: true,
        shelfQuantity: 2,
        spotQuantity: 3,
      },
    );

    expect(splitCart).toHaveLength(2);

    const shelfLine = splitCart.find((i) => i.id === "p2");
    expect(shelfLine).toBeDefined();
    expect(shelfLine?.quantity).toBe(2);
    expect(shelfLine?.subtotal).toBe(6000);
    expect(shelfLine?.is_spot_sourced).toBeUndefined();

    const spotLine = splitCart.find((i) => i.id === "p2:spot_sourced");
    expect(spotLine).toBeDefined();
    expect(spotLine?.product_id).toBe("p2");
    expect(spotLine?.quantity).toBe(3);
    expect(spotLine?.subtotal).toBe(9000);
    expect(spotLine?.is_spot_sourced).toBe(true);
    expect(spotLine?.sourcing_cost).toBe(2400);
    expect(spotLine?.sourcing_partner).toBe("City Care Pharmacy");
  });

  it("partial spot sourcing: 2 from shelf and 3 spot-sourced deducts 2 from inventory and pays external cost for only 3 units", async () => {
    const saleId = await writeSaleTransaction({
      ...baseSale,
      cart: [
        {
          id: "p2",
          name: "Augmentin 625mg",
          generic_name: "",
          strength: "",
          unit_price: 3000,
          original_unit_price: 3000,
          stock: 5,
          quantity: 2,
          subtotal: 6000,
          cost_price: 2000,
        },
        {
          id: "p2:spot_sourced",
          product_id: "p2",
          name: "Augmentin 625mg",
          generic_name: "",
          strength: "",
          unit_price: 3000,
          original_unit_price: 3000,
          stock: 5,
          quantity: 3,
          subtotal: 9000,
          cost_price: 2000,
          is_spot_sourced: true,
          sourcing_cost: 2500,
          sourcing_payment_source: "cash_drawer",
          sourcing_partner: "City Care Pharmacy",
        },
      ],
      subtotal: 15000,
      total: 15000,
      amountPaid: "15000",
      transactionNumber: "DRX-PARTIAL-SPOT-001",
    });

    expect(saleId).toBeTruthy();

    const remainingBatchStock = Number(
      db.exec("SELECT quantity FROM stock_batches WHERE id = 'b2'")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(remainingBatchStock).toBe(3);

    const movementRows = db.exec(
      "SELECT quantity, unit_cost, total_cost FROM stock_movements WHERE product_id = 'p2'",
    )[0]?.values ?? [];
    expect(movementRows).toHaveLength(1);
    expect(movementRows[0][0]).toBe(-2);
    expect(movementRows[0][1]).toBe(2000);
    expect(movementRows[0][2]).toBe(4000);

    const saleItemRows = db.exec(
      "SELECT product_id, quantity, unit_price, cost_price, total_price, stock_batch_id FROM sale_items WHERE sale_id = '" +
        saleId +
        "' ORDER BY quantity ASC",
    )[0]?.values ?? [];
    expect(saleItemRows).toHaveLength(2);
    expect(saleItemRows[0]).toEqual(["p2", 2, 3000, 2000, 6000, "b2"]);
    expect(saleItemRows[1]).toEqual(["p2", 3, 3000, 2500, 9000, null]);

    const saleRow = db.exec(
      "SELECT payment_details, notes FROM sales WHERE id = '" + saleId + "'",
    )[0]?.values?.[0];
    const details = JSON.parse(String(saleRow[0]));
    expect(details.spot_sourcing).toHaveLength(1);
    expect(details.spot_sourcing[0]).toMatchObject({
      product_id: "p2",
      quantity: 3,
      unit_cost: 2500,
      payment_source: "cash_drawer",
      partner: "City Care Pharmacy",
    });

    const spotPayout = details.spot_sourcing.reduce(
      (sum: number, item: { payment_source: string; unit_cost: number; quantity: number }) =>
        item.payment_source === "cash_drawer" ? sum + item.unit_cost * item.quantity : sum,
      0,
    );
    expect(spotPayout).toBe(7500);

    // Invariant from PR #299: external spot sourcing is recorded in sales.payment_details
    // for till reconciliation, NOT as an OPEX expense in the expenses table.
    const expenseCount = Number(
      db.exec("SELECT count(*) FROM expenses")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(expenseCount).toBe(0);

    expect(String(saleRow[1])).toContain("Spot Sourced: 3x Augmentin 625mg");

    const { getTransactionDetails } = await import("@/lib/db/queries/sales");
    const { extractSpotSourcedProductIds, isSpotSourcedSaleLine } = await import("@/lib/utils/spot-sourcing");
    const spotIds = extractSpotSourcedProductIds(saleRow[0]);
    const lines = (await getTransactionDetails(saleId)).items;
    const flagged = lines.filter((line) => isSpotSourcedSaleLine(line, spotIds)).map((line) => line.quantity);
    expect(flagged).toEqual([3]);
  });
});

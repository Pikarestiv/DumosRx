import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-spot-1";

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

const spotPipeLine = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "PVC Pipe 2 inch",
  generic_name: "",
  strength: "",
  unit_price: 5000,
  original_unit_price: 5000,
  stock: 0,
  quantity: 1,
  subtotal: 5000,
  is_spot_sourced: true,
  sourcing_cost: 4500,
  sourcing_payment_source: "cash_drawer" as const,
  ...overrides,
});

describe("POS Spot Sourcing (in-cart external sourcing)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory-sale-stock").recordSaleItemStock;
  let writeSaleTransaction: typeof import("@/lib/hooks/pos-sale-writer").writeSaleTransaction;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert } = await import("@/lib/db/base-helpers"));
    ({ recordSaleItemStock } = await import("@/lib/db/queries/inventory-sale-stock"));
    ({ writeSaleTransaction } = await import("@/lib/hooks/pos-sale-writer"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;
       DELETE FROM sale_items; DELETE FROM sale_item_batches; DELETE FROM sales;
       DELETE FROM expenses; DELETE FROM _sync_queue; DELETE FROM audit_logs;`,
    );
    db.run(`INSERT INTO products (id, name, selling_price, _deleted, store_id)
            VALUES ('p1', 'PVC Pipe 2 inch', 5000, 0, '${STORE_ID}')`);
    db.run(`INSERT INTO products (id, name, selling_price, _deleted, store_id)
            VALUES ('p2', 'Augmentin 625mg', 3000, 0, '${STORE_ID}')`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, store_id, created_at, updated_at)
       VALUES ('b2', 'p2', 'B-p2', 5, 2000, 1, 0, '${STORE_ID}', '2026-11-01', '2026-11-01')`,
    );
  });

  it("recordSaleItemStock with isSpotSourced=true bypasses batch deduction and stock movements", async () => {
    const saleItemId = await recordSaleItemStock({
      saleId: "sale-spot-1",
      productId: "p1",
      quantity: 2,
      unitPrice: 5000,
      costPrice: 4500,
      subtotal: 10000,
      cashierId: "cashier-1",
      correlationId: "sale-spot-1",
      isSpotSourced: true,
    });

    expect(saleItemId).toBeTruthy();

    const saleItemRows = db.exec(
      "SELECT product_id, quantity, unit_price, cost_price, total_price, stock_batch_id FROM sale_items WHERE sale_id = 'sale-spot-1'",
    )[0]?.values ?? [];

    expect(saleItemRows).toHaveLength(1);
    expect(saleItemRows[0]).toEqual(["p1", 2, 5000, 4500, 10000, null]);

    const movementCount = Number(
      db.exec("SELECT COUNT(*) FROM stock_movements")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(movementCount).toBe(0);

    const batchDeficitCount = Number(
      db.exec("SELECT COUNT(*) FROM stock_batches WHERE quantity < 0")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(batchDeficitCount).toBe(0);
  });

  it("writeSaleTransaction with spot-sourced item paid from cash drawer records details in sale without creating operating expenses", async () => {
    const saleId = await writeSaleTransaction({
      ...baseSale,
      cart: [spotPipeLine({ quantity: 2, subtotal: 10000, sourcing_partner: "Kiki Hardware Across Street" })],
      subtotal: 10000,
      total: 10000,
      amountPaid: "10000",
      saleNote: "Customer quick walk-in",
      transactionNumber: "DRX-SPOT-001",
    });

    expect(saleId).toBeTruthy();

    const saleRows = db.exec(
      "SELECT transaction_number, total_amount, notes, payment_details FROM sales WHERE id = '" + saleId + "'",
    )[0]?.values ?? [];
    expect(saleRows).toHaveLength(1);
    expect(saleRows[0][0]).toBe("DRX-SPOT-001");
    expect(String(saleRows[0][2])).toContain("Spot Sourced: 2x PVC Pipe 2 inch");

    const paymentDetails = JSON.parse(String(saleRows[0][3]));
    expect(paymentDetails.spot_sourcing).toHaveLength(1);
    expect(paymentDetails.spot_sourcing[0]).toMatchObject({
      product_id: "p1",
      quantity: 2,
      unit_cost: 4500,
      payment_source: "cash_drawer",
      partner: "Kiki Hardware Across Street",
    });

    const expenseRows = db.exec(
      "SELECT category, description, amount, payment_method, reference_number FROM expenses WHERE reference_number = 'DRX-SPOT-001'",
    )[0]?.values ?? [];

    expect(expenseRows).toHaveLength(0);

    const movementCount = Number(
      db.exec("SELECT COUNT(*) FROM stock_movements")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(movementCount).toBe(0);
  });

  it("writeSaleTransaction with spot-sourced item paid via external credit does NOT log cash drawer expense", async () => {
    const saleId = await writeSaleTransaction({
      ...baseSale,
      cart: [spotPipeLine({ sourcing_payment_source: "external", sourcing_partner: "Neighbour Store" })],
      subtotal: 5000,
      total: 5000,
      amountPaid: "5000",
      transactionNumber: "DRX-SPOT-002",
    });

    expect(saleId).toBeTruthy();

    const expenseRows = db.exec(
      "SELECT COUNT(*) FROM expenses WHERE reference_number = 'DRX-SPOT-002'",
    )[0]?.values ?? [];
    expect(Number(expenseRows[0][0])).toBe(0);

    const saleItemRows = db.exec(
      "SELECT cost_price FROM sale_items WHERE sale_id = '" + saleId + "'",
    )[0]?.values ?? [];
    expect(saleItemRows[0][0]).toBe(4500);
  });

  it("mixed cart: shelf stock item deducts inventory, spot-sourced item does not", async () => {
    await writeSaleTransaction({
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
        spotPipeLine(),
      ],
      subtotal: 11000,
      total: 11000,
      amountPaid: "11000",
      transactionNumber: "DRX-MIXED-001",
    });

    const p2RemainingStock = Number(
      db.exec("SELECT quantity FROM stock_batches WHERE id = 'b2'")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(p2RemainingStock).toBe(3);

    const p1Movements = db.exec(
      "SELECT COUNT(*) FROM stock_movements WHERE product_id = 'p1'",
    )[0]?.values?.[0]?.[0];
    expect(Number(p1Movements)).toBe(0);

    const expensesCount = Number(
      db.exec("SELECT COUNT(*) FROM expenses WHERE reference_number = 'DRX-MIXED-001'")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(expensesCount).toBe(0);
  });

  it("cash drawer spot sourcing is tracked in payment_details for till reconciliation without polluting expenses table", async () => {
    const { buildNetCashBreakdown } = await import("@/lib/utils/daily-close-breakdown");
    const { getLocalTodayDate } = await import("@/lib/utils");
    const today = getLocalTodayDate();

    const saleId = await writeSaleTransaction({
      ...baseSale,
      cart: [spotPipeLine()],
      subtotal: 5000,
      total: 5000,
      amountPaid: "5000",
      transactionNumber: "DRX-PNL-001",
    });

    const saleRow = db.exec(
      "SELECT payment_details FROM sales WHERE id = '" + saleId + "'",
    )[0]?.values?.[0]?.[0];
    const details = JSON.parse(String(saleRow));
    const spotPayout = details.spot_sourcing.reduce(
      (sum: number, item: { payment_source: string; unit_cost: number; quantity: number }) =>
        item.payment_source === "cash_drawer" ? sum + item.unit_cost * item.quantity : sum,
      0,
    );
    expect(spotPayout).toBe(4500);

    const breakdown = buildNetCashBreakdown({
      cashSales: 5000,
      cashRefunds: 0,
      cashExpenses: 0,
      spotSourcingPayouts: spotPayout,
      reportDate: today,
    });

    expect(breakdown.total).toBe(500);
    expect(breakdown.lines).toContainEqual({
      label: "Spot-sourced stock purchased",
      amount: -4500,
    });

    const expenseCount = Number(
      db.exec("SELECT COUNT(*) FROM expenses")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(expenseCount).toBe(0);
  });

  it("buildNewCartItem and repriceCartFromCatalog preserve spot-sourced quantity > 1 and custom sellingPrice override", async () => {
    const {
      buildNewCartItem,
      applySpotSourcingConfig,
      stripSpotSourcingConfig,
      repriceCartFromCatalog,
    } = await import("@/lib/hooks/use-pos-cart-store");

    const catalogProduct = {
      id: "p1",
      name: "PVC Pipe 2 inch",
      generic_name: "",
      strength: "",
      unit_price: 5000,
      cost_price: 4000,
      stock: 0,
    };

    const item = buildNewCartItem(catalogProduct, {
      isSpotSourced: true,
      sourcingCost: 4600,
      paymentSource: "cash_drawer",
      partner: "Kiki Hardware",
      quantity: 3,
      sellingPrice: 5500,
    });

    expect(item.quantity).toBe(3);
    expect(item.unit_price).toBe(5500);
    expect(item.original_unit_price).toBe(5000);
    expect(item.subtotal).toBe(16500);
    expect(item.is_spot_sourced).toBe(true);
    expect(item.sourcing_cost).toBe(4600);

    const { cart: repriced, repricedNames } = repriceCartFromCatalog([item], [catalogProduct]);
    expect(repricedNames).toEqual([]);
    expect(repriced[0].unit_price).toBe(5500);
    expect(repriced[0].subtotal).toBe(16500);

    const updated = applySpotSourcingConfig(item, {
      isSpotSourced: true,
      sourcingCost: 4700,
      paymentSource: "external",
      quantity: 4,
      sellingPrice: 6000,
    });
    expect(updated.quantity).toBe(4);
    expect(updated.unit_price).toBe(6000);
    expect(updated.subtotal).toBe(24000);

    const reverted = stripSpotSourcingConfig(updated, 2, false, false);
    expect(reverted.is_spot_sourced).toBeUndefined();
    expect(reverted.quantity).toBe(2);
    expect(reverted.unit_price).toBe(5000);
    expect(reverted.subtotal).toBe(10000);
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
    // Initial batch b2 has 5 units of p2
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

    // 1. Shelf stock batch was consumed by exactly 2 units (5 - 2 = 3)
    const remainingBatchStock = Number(
      db.exec("SELECT quantity FROM stock_batches WHERE id = 'b2'")[0]?.values?.[0]?.[0] ?? -1,
    );
    expect(remainingBatchStock).toBe(3);

    // 2. Exactly one stock movement recorded (for the 2 shelf units only)
    const movementRows = db.exec(
      "SELECT quantity, unit_cost, total_cost FROM stock_movements WHERE product_id = 'p2'",
    )[0]?.values ?? [];
    expect(movementRows).toHaveLength(1);
    expect(movementRows[0][0]).toBe(-2);
    expect(movementRows[0][1]).toBe(2000);
    expect(movementRows[0][2]).toBe(4000);

    // 3. Sale items: 2 rows recorded (shelf line has stock_batch_id, spot line has NULL stock_batch_id)
    const saleItemRows = db.exec(
      "SELECT product_id, quantity, unit_price, cost_price, total_price, stock_batch_id FROM sale_items WHERE sale_id = '" +
        saleId +
        "' ORDER BY quantity ASC",
    )[0]?.values ?? [];
    expect(saleItemRows).toHaveLength(2);
    expect(saleItemRows[0]).toEqual(["p2", 2, 3000, 2000, 6000, "b2"]);
    expect(saleItemRows[1]).toEqual(["p2", 3, 3000, 2500, 9000, null]);

    // 4. Cash drawer payout in payment_details records only the 3 spot-sourced units: 3 * 2500 = 7500
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
    expect(spotPayout).toBe(7500); // 3 * 2500, NOT 5 * 2500 = 12500!

    // 5. Notes indicate exactly 3x spot sourced
    expect(String(saleRow[1])).toContain("Spot Sourced: 3x Augmentin 625mg");
  });
});

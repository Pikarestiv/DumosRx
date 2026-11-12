import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";
import { getStockLossTotal } from "@/lib/db/queries/finance";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Multi-batch FEFO return costing and disposition", () => {
  const { run, processReturn, scalar } = setupProcessReturnHarness();

  it("handles multi-batch FEFO return with exact batch-level valuation and split restock/discard disposition", async () => {
    const productId = "p-fefo-multi";
    const batchA = "b-fefo-A";
    const batchB = "b-fefo-B";
    const sellingPrice = 8000;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Antibiotic Suspension', ${sellingPrice})`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchA}', '${productId}', 'BN-A', 2, 4000, 1)`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchB}', '${productId}', 'BN-B', 3, 6000, 1)`);

    // Sale of 4 units: consumes 2 from Batch A (all of A) and 2 from Batch B (1 left in B)
    run(`UPDATE stock_batches SET quantity = 0 WHERE id = '${batchA}'`);
    run(`UPDATE stock_batches SET quantity = 1 WHERE id = '${batchB}'`);

    const saleId = "s-fefo-multi";
    const totalCogs = 2 * 4000 + 2 * 6000;
    const weightedUnitCost = totalCogs / 4;

    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-FEFO-MULTI', 32000, 32000, 32000, 'cash', 'completed', '2026-11-12T10:00:00.000Z')`);

    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-fefo', '${saleId}', '${productId}', 4, ${sellingPrice}, ${weightedUnitCost}, 32000)`);

    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-A', 'si-fefo', '${batchA}', 2),
                ('sib-B', 'si-fefo', '${batchB}', 2)`);

    const sale = { id: saleId, subtotal: 32000, total_amount: 32000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-fefo", sale_id: saleId, product_id: productId, quantity: 4, unit_price: sellingPrice, cost_price: weightedUnitCost, total_price: 32000 };

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Patient allergic reaction, vials partially unsealed",
      totalRefund: 32000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4, discardQuantity: 2, discardReason: "Opened / Unsealed" }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchA}'`)).toBe(2);
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchB}'`)).toBe(1);

    const damageLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(damageLoss).toBe(12000);

    const currentValuation = scalar(`SELECT SUM(quantity * cost_price) FROM stock_batches WHERE product_id = '${productId}'`);
    expect(currentValuation).toBe(14000);

    // Exact reconciliation: Starting inventory (26,000) = Ending valuation (14,000) + Damage loss (12,000)
    expect(Number(currentValuation) + damageLoss).toBe(26000);
  });

  it("reverses exact batch costs on partial returns where customer keeps some units", async () => {
    const productId = "p-partial-kept";
    const batchA = "b-part-A";
    const batchB = "b-part-B";
    const sellingPrice = 5000;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Syrup', ${sellingPrice})`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchA}', '${productId}', 'BN-P-A', 2, 4000, 1)`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchB}', '${productId}', 'BN-P-B', 3, 6000, 1)`);

    run(`UPDATE stock_batches SET quantity = 0 WHERE id = '${batchA}'`);
    run(`UPDATE stock_batches SET quantity = 1 WHERE id = '${batchB}'`);

    const saleId = "s-part-kept";
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-PART-KEPT', 20000, 20000, 20000, 'cash', 'completed', '2026-11-12T10:00:00.000Z')`);

    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-part', '${saleId}', '${productId}', 4, ${sellingPrice}, 5000, 20000)`);

    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-pa', 'si-part', '${batchA}', 2),
                ('sib-pb', 'si-part', '${batchB}', 2)`);

    const sale = { id: saleId, subtotal: 20000, total_amount: 20000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-part", sale_id: saleId, product_id: productId, quantity: 4, unit_price: sellingPrice, cost_price: 5000, total_price: 20000 };

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Surplus units",
      totalRefund: 10000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2, discardQuantity: 0 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchA}'`)).toBe(2);
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchB}'`)).toBe(1);

    const valuation = scalar(`SELECT SUM(quantity * cost_price) FROM stock_batches WHERE product_id = '${productId}'`);
    expect(valuation).toBe(14000);

    const returnedCogs = scalar(`SELECT SUM(total_cost) FROM stock_movements WHERE reference_id IN (SELECT id FROM returns WHERE sale_id = '${saleId}') AND movement_type = 'return'`);
    expect(returnedCogs).toBe(8000);

    // Starting inventory (26,000) = Ending inventory (14,000) + Net COGS (12,000)
    expect(Number(valuation) + (20000 - Number(returnedCogs))).toBe(26000);
  });

  it("handles repeated partial returns on the same sale without double-restoring batches", async () => {
    const productId = "p-repeat-ret";
    const batchA = "b-rep-A";
    const batchB = "b-rep-B";

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Drops', 5000)`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchA}', '${productId}', 'BN-R-A', 2, 4000, 1)`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchB}', '${productId}', 'BN-R-B', 2, 6000, 1)`);

    run(`UPDATE stock_batches SET quantity = 0 WHERE id = '${batchA}'`);
    run(`UPDATE stock_batches SET quantity = 0 WHERE id = '${batchB}'`);

    const saleId = "s-repeat-sale";
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-REP', 20000, 20000, 20000, 'cash', 'completed', '2026-11-12T10:00:00.000Z')`);

    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-rep', '${saleId}', '${productId}', 4, 5000, 5000, 20000)`);

    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-ra', 'si-rep', '${batchA}', 2),
                ('sib-rb', 'si-rep', '${batchB}', 2)`);

    const sale = { id: saleId, subtotal: 20000, total_amount: 20000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-rep", sale_id: saleId, product_id: productId, quantity: 4, unit_price: 5000, cost_price: 5000, total_price: 20000 };

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Partial return 1",
      totalRefund: 5000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1, discardQuantity: 0 }],
      saleItems: [saleItem],
    });
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchA}'`)).toBe(1);
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchB}'`)).toBe(0);

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Partial return 2",
      totalRefund: 10000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2, discardQuantity: 0 }],
      saleItems: [saleItem],
    });
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchA}'`)).toBe(2);
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchB}'`)).toBe(1);

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Partial return 3",
      totalRefund: 5000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1, discardQuantity: 0 }],
      saleItems: [saleItem],
    });
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchA}'`)).toBe(2);
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchB}'`)).toBe(2);

    const valuation = scalar(`SELECT SUM(quantity * cost_price) FROM stock_batches WHERE product_id = '${productId}'`);
    expect(valuation).toBe(20000);
  });
});


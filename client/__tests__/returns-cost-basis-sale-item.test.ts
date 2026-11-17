import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";
import { getStockLossTotal } from "@/lib/db/queries/finance";
import { getBIMetrics } from "@/lib/db/queries/reports";
import { getAdvancedMonthlySalesData } from "@/lib/db/queries/report-trends";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("A-374: Returns value movements from sale_items.cost_price, not live batch cost", () => {
  const { run, processReturn, scalar } = setupProcessReturnHarness();

  it("values restocked units at sale item cost basis netting COGS to zero after a batch cost correction", async () => {
    const productId = "p-cost-corr";
    const batchId = "b-cost-corr";
    const saleId = "s-cost-corr";
    const originalCost = 4000;
    const correctedCost = 5500;
    const sellingPrice = 8000;
    const saleDate = "2026-11-12T10:00:00.000Z";

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Amoxicillin 500mg', ${sellingPrice})`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchId}', '${productId}', 'BN-001', 5, ${originalCost}, 1)`);

    // Sale of 2 units at original batch cost 4,000
    run(`UPDATE stock_batches SET quantity = 3 WHERE id = '${batchId}'`);
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-A374-1', 16000, 16000, 16000, 'cash', 'completed', '${saleDate}')`);
    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-a374-1', '${saleId}', '${productId}', 2, ${sellingPrice}, ${originalCost}, 16000)`);
    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-a374-1', 'si-a374-1', '${batchId}', 2)`);

    // Owner corrects batch cost to 5,500 after sale
    run(`UPDATE stock_batches SET cost_price = ${correctedCost} WHERE id = '${batchId}'`);

    const sale = { id: saleId, subtotal: 16000, total_amount: 16000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-a374-1", sale_id: saleId, product_id: productId, quantity: 2, unit_price: sellingPrice, cost_price: originalCost, total_price: 16000 };

    // Customer returns all 2 units
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Customer change of mind",
      totalRefund: 16000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2, discardQuantity: 0 }],
      saleItems: [saleItem],
    });

    // 1. Stock quantity restored to 5
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`)).toBe(5);

    // 2. Return movement must be valued at original sale unit cost (4,000), NOT corrected batch cost (5,500)
    const movementUnitCost = scalar(`SELECT unit_cost FROM stock_movements WHERE movement_type = 'return' AND product_id = '${productId}'`);
    const movementTotalCost = scalar(`SELECT total_cost FROM stock_movements WHERE movement_type = 'return' AND product_id = '${productId}'`);
    expect(movementUnitCost).toBe(originalCost);
    expect(movementTotalCost).toBe(originalCost * 2);

    // 3. BI Metrics: returned COGS matches original sale COGS (8,000), netting net COGS to 0
    const biMetrics = await getBIMetrics("2026-11-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", undefined, "2026-11-30T23:59:59.999Z");
    const grossCogs = biMetrics.cogsData[0]?.total || 0;
    const returnedCogs = biMetrics.returnedCogsData[0]?.total || 0;
    expect(grossCogs).toBe(8000);
    expect(returnedCogs).toBe(8000);
    expect(grossCogs - returnedCogs).toBe(0);

    // 4. Monthly trends: returned_cogs matches 8,000
    const monthlyTrends = await getAdvancedMonthlySalesData("2026-11-01T00:00:00.000Z", "2026-11-30T23:59:59.999Z");
    const novReturns = monthlyTrends.rawMonthlyReturns.find((m) => m.month === "2026-11");
    expect(novReturns?.returned_cogs).toBe(8000);
  });

  it("values damage loss at sale item cost basis when returned units are discarded after batch cost correction", async () => {
    const productId = "p-cost-discard";
    const batchId = "b-cost-discard";
    const saleId = "s-cost-discard";
    const originalCost = 3000;
    const correctedCost = 7000;
    const sellingPrice = 6000;
    const saleDate = "2026-11-12T10:00:00.000Z";

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Cough Elixir', ${sellingPrice})`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchId}', '${productId}', 'BN-002', 4, ${originalCost}, 1)`);

    run(`UPDATE stock_batches SET quantity = 2 WHERE id = '${batchId}'`);
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-A374-2', 12000, 12000, 12000, 'cash', 'completed', '${saleDate}')`);
    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-a374-2', '${saleId}', '${productId}', 2, ${sellingPrice}, ${originalCost}, 12000)`);
    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-a374-2', 'si-a374-2', '${batchId}', 2)`);

    // Audit/batch correction changes batch cost
    run(`UPDATE stock_batches SET cost_price = ${correctedCost} WHERE id = '${batchId}'`);

    const sale = { id: saleId, subtotal: 12000, total_amount: 12000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-a374-2", sale_id: saleId, product_id: productId, quantity: 2, unit_price: sellingPrice, cost_price: originalCost, total_price: 12000 };

    // Customer returns 2 units, both discarded due to contamination
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Contaminated bottle",
      totalRefund: 12000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2, discardQuantity: 2, discardReason: "Contaminated" }],
      saleItems: [saleItem],
    });

    // 1. Physical batch quantity remains 2 (discarded, not restocked)
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`)).toBe(2);

    // 2. Discard movement must be valued at original sale unit cost (3,000), NOT corrected batch cost (7,000)
    const discardUnitCost = scalar(`SELECT unit_cost FROM stock_movements WHERE movement_type = 'adjustment' AND product_id = '${productId}'`);
    const discardTotalCost = scalar(`SELECT total_cost FROM stock_movements WHERE movement_type = 'adjustment' AND product_id = '${productId}'`);
    expect(discardUnitCost).toBe(originalCost);
    expect(discardTotalCost).toBe(originalCost * 2);

    // 3. Damage loss is exactly 2 * 3,000 = 6,000 (NOT 14,000)
    const damageLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(damageLoss).toBe(6000);
  });

  it("reverses exact blended cost per unit returned when sale consumed multiple batches with different costs", async () => {
    const productId = "p-multi-blend";
    const batchA = "b-blend-A";
    const batchB = "b-blend-B";
    const saleId = "s-multi-blend";
    const sellingPrice = 10000;
    const saleDate = "2026-11-12T10:00:00.000Z";

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Vitamin C Vials', ${sellingPrice})`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchA}', '${productId}', 'BN-A', 2, 4000, 1)`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchB}', '${productId}', 'BN-B', 2, 6000, 1)`);

    // Sale of 4 units: 2 from Batch A (4,000) and 2 from Batch B (6,000). Total COGS = 20,000, avg cost = 5,000
    run(`UPDATE stock_batches SET quantity = 0 WHERE id = '${batchA}'`);
    run(`UPDATE stock_batches SET quantity = 0 WHERE id = '${batchB}'`);
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-A374-3', 40000, 40000, 40000, 'cash', 'completed', '${saleDate}')`);
    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-a374-3', '${saleId}', '${productId}', 4, ${sellingPrice}, 5000, 40000)`);
    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-ba', 'si-a374-3', '${batchA}', 2),
                ('sib-bb', 'si-a374-3', '${batchB}', 2)`);

    const sale = { id: saleId, subtotal: 40000, total_amount: 40000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-a374-3", sale_id: saleId, product_id: productId, quantity: 4, unit_price: sellingPrice, cost_price: 5000, total_price: 40000 };

    // Partial return of 2 units (restocked to Batch A)
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Customer returned half order",
      totalRefund: 20000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2, discardQuantity: 0 }],
      saleItems: [saleItem],
    });

    // Return movement total_cost is 2 * 5,000 = 10,000 (NOT 2 * 4,000 = 8,000)
    const returnedCogs = scalar(`SELECT SUM(total_cost) FROM stock_movements WHERE reference_id IN (SELECT id FROM returns WHERE sale_id = '${saleId}') AND movement_type = 'return'`);
    expect(returnedCogs).toBe(10000);

    // BI metrics reflects exactly 10,000 returned COGS, leaving exactly 10,000 net COGS for the 2 kept units
    const biMetrics = await getBIMetrics("2026-11-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", undefined, "2026-11-30T23:59:59.999Z");
    const grossCogs = biMetrics.cogsData[0]?.total || 0;
    const reportedReturnedCogs = biMetrics.returnedCogsData[0]?.total || 0;
    expect(grossCogs).toBe(20000);
    expect(reportedReturnedCogs).toBe(10000);
    expect(grossCogs - reportedReturnedCogs).toBe(10000);
  });
});

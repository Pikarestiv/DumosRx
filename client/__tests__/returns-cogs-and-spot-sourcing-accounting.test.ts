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

describe("Returns COGS, stock loss and spot sourcing accounting", () => {
  const { run, processReturn, scalar } = setupProcessReturnHarness();

  it("spot-sourced return with split disposition reverses COGS, records damage loss once, and avoids phantom stock", async () => {
    // 1. Setup spot-sourced product (0 initial stock batches)
    const productId = "p-spot-split";
    const saleId = "s-spot-split";
    const sourcingUnitCost = 4500;
    const sellingPrice = 10000;
    const saleQty = 3;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Special Injection', ${sellingPrice})`);

    const paymentDetails = JSON.stringify({
      spot_sourcing: [
        { product_id: productId, cost_price: sourcingUnitCost, quantity: saleQty, payment_source: "cash_drawer" },
      ],
    });

    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, payment_details, transaction_date)
         VALUES ('${saleId}', 'TXN-SPOT-SPLIT', 30000, 30000, 30000, 'cash', 'completed', '${paymentDetails}', '2026-11-12T10:00:00.000Z')`);

    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-spot-1', '${saleId}', '${productId}', ${saleQty}, ${sellingPrice}, ${sourcingUnitCost}, 30000)`);

    // Verify initial COGS before return: 3 * 4500 = 13,500
    const initialGrossCogs = scalar(`SELECT SUM(cost_price * quantity) FROM sale_items WHERE sale_id = '${saleId}'`);
    expect(initialGrossCogs).toBe(13500);

    const sale = {
      id: saleId,
      subtotal: 30000,
      total_amount: 30000,
      payment_method: "cash",
      payment_status: "completed",
      payment_details: paymentDetails,
    };

    const saleItem = {
      id: "si-spot-1",
      sale_id: saleId,
      product_id: productId,
      quantity: saleQty,
      unit_price: sellingPrice,
      cost_price: sourcingUnitCost,
      total_price: 30000,
    };

    // 2. Customer returns all 3 units: 2 restocked, 1 discarded as damaged
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Customer return with partial damage",
      totalRefund: 30000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 3, discardQuantity: 1, discardReason: "Damaged / Broken" }],
      saleItems: [saleItem],
    });

    // A. Inventory Batches: only 2 restocked units enter stock
    const batchRows = scalar(`SELECT COUNT(*) FROM stock_batches WHERE product_id = '${productId}'`);
    expect(batchRows).toBe(1);
    const restockedBatchQty = scalar(`SELECT quantity FROM stock_batches WHERE product_id = '${productId}'`);
    expect(restockedBatchQty).toBe(2);
    const restockedBatchCost = scalar(`SELECT cost_price FROM stock_batches WHERE product_id = '${productId}'`);
    expect(restockedBatchCost).toBe(sourcingUnitCost);
    const restockedBatchNumber = scalar(`SELECT batch_number FROM stock_batches WHERE product_id = '${productId}'`) as string;
    expect(restockedBatchNumber).toMatch(/^RETURN-/);

    // B. On-hand inventory calculation: strictly 2 (no phantom negative inventory)
    const onHandQty = scalar(`SELECT COALESCE(SUM(quantity), 0) FROM stock_batches WHERE product_id = '${productId}' AND _deleted = 0`);
    expect(onHandQty).toBe(2);

    // C. Discarded unit (1) generates damage loss movement without batch ID
    const discardMovements = scalar(`SELECT COUNT(*) FROM stock_movements WHERE product_id = '${productId}' AND movement_type = 'adjustment'`);
    expect(discardMovements).toBe(1);
    const discardQty = scalar(`SELECT quantity FROM stock_movements WHERE product_id = '${productId}' AND movement_type = 'adjustment'`);
    expect(discardQty).toBe(-1);
    const discardBatchId = scalar(`SELECT stock_batch_id FROM stock_movements WHERE product_id = '${productId}' AND movement_type = 'adjustment'`);
    expect(discardBatchId).toBeNull();

    // D. COGS Reversal via return_items: returned_cogs equals full 3 * 4500 = 13,500
    const returnedCogs = scalar(`
      SELECT SUM(ri.quantity * IFNULL(sic.avg_cost_price, 0))
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      LEFT JOIN (
        SELECT sale_id, product_id, SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost_price
        FROM sale_items
        GROUP BY sale_id, product_id
      ) sic ON sic.sale_id = r.sale_id AND sic.product_id = ri.product_id
      WHERE r.sale_id = '${saleId}'
    `);
    expect(returnedCogs).toBe(13500);

    const netCogs = Number(initialGrossCogs) - Number(returnedCogs);
    expect(netCogs).toBe(0);

    // E. Damage loss recognition in getStockLossTotal()
    const damageLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(damageLoss).toBe(4500); // Exactly 1 discarded unit @ 4,500

    // F. Total acquisition cost reconciliation
    // Original payout to supplier: 13,500
    // Inventory restored: 2 * 4500 = 9,000
    // Damage loss recognized: 1 * 4500 = 4,500
    // Net COGS: 0
    const inventoryValuation = scalar(`SELECT SUM(cost_price * quantity) FROM stock_batches WHERE product_id = '${productId}'`);
    expect(inventoryValuation).toBe(9000);
    expect(Number(inventoryValuation) + damageLoss + netCogs).toBe(13500);
  });

  it("100% discarded spot-sourced return creates zero stock batches and leaves no phantom inventory", async () => {
    const productId = "p-spot-all-dmg";
    const saleId = "s-spot-all-dmg";
    const sourcingUnitCost = 5000;
    const sellingPrice = 8000;
    const saleQty = 2;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Glass Ampoule', ${sellingPrice})`);

    const paymentDetails = JSON.stringify({
      spot_sourcing: [
        { product_id: productId, cost_price: sourcingUnitCost, quantity: saleQty, payment_source: "cash_drawer" },
      ],
    });

    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, payment_details, transaction_date)
         VALUES ('${saleId}', 'TXN-SPOT-ALL-DMG', 16000, 16000, 16000, 'cash', 'completed', '${paymentDetails}', '2026-11-12T11:00:00.000Z')`);

    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-spot-2', '${saleId}', '${productId}', ${saleQty}, ${sellingPrice}, ${sourcingUnitCost}, 16000)`);

    const sale = {
      id: saleId,
      subtotal: 16000,
      total_amount: 16000,
      payment_method: "cash",
      payment_status: "completed",
      payment_details: paymentDetails,
    };

    const saleItem = {
      id: "si-spot-2",
      sale_id: saleId,
      product_id: productId,
      quantity: saleQty,
      unit_price: sellingPrice,
      cost_price: sourcingUnitCost,
      total_price: 16000,
    };

    // Return 2 units, 100% discarded (0 restocked)
    await processReturn({
      sale,
      userId: "user-1",
      reason: "All ampoules shattered in transit",
      totalRefund: 16000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2, discardQuantity: 2, discardReason: "Damaged / Broken" }],
      saleItems: [saleItem],
    });

    // Zero stock batches created
    expect(scalar(`SELECT COUNT(*) FROM stock_batches WHERE product_id = '${productId}'`)).toBe(0);
    // On-hand stock is strictly 0 (no phantom negative count)
    expect(scalar(`SELECT COALESCE(SUM(quantity), 0) FROM stock_batches WHERE product_id = '${productId}'`)).toBe(0);

    // Damage loss recognized for both units (2 * 5000 = 10,000)
    const damageLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(damageLoss).toBe(10000);

    // Net COGS reversed to 0
    const grossCogs = scalar(`SELECT SUM(cost_price * quantity) FROM sale_items WHERE sale_id = '${saleId}'`);
    const returnedCogs = scalar(`
      SELECT SUM(ri.quantity * IFNULL(sic.avg_cost_price, 0))
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      LEFT JOIN (
        SELECT sale_id, product_id, SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost_price
        FROM sale_items
        GROUP BY sale_id, product_id
      ) sic ON sic.sale_id = r.sale_id AND sic.product_id = ri.product_id
      WHERE r.sale_id = '${saleId}'
    `);
    expect(Number(grossCogs) - Number(returnedCogs)).toBe(0);
  });

  it("ordinary stocked return restores batch without double deduction when partially discarded", async () => {
    const productId = "p-ordinary";
    const batchId = "b-ordinary-1";
    const unitCost = 3000;
    const sellingPrice = 5000;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Syrup 100ml', ${sellingPrice})`);
    // Initial batch: 10 units @ 3000
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchId}', '${productId}', 'BN-ORD-1', 10, ${unitCost}, 1)`);

    // Sale of 4 units, leaving 6 in batch
    run(`UPDATE stock_batches SET quantity = 6 WHERE id = '${batchId}'`);
    const saleId = "s-ordinary";
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-ORD', 20000, 20000, 20000, 'cash', 'completed', '2026-11-12T12:00:00.000Z')`);
    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-ord', '${saleId}', '${productId}', 4, ${sellingPrice}, ${unitCost}, 20000)`);
    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-ord', 'si-ord', '${batchId}', 4)`);

    const sale = { id: saleId, subtotal: 20000, total_amount: 20000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-ord", sale_id: saleId, product_id: productId, quantity: 4, unit_price: sellingPrice, cost_price: unitCost, total_price: 20000 };

    // Return all 4 units: 3 restocked, 1 discarded (broken seal)
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Broken seal on 1 bottle",
      totalRefund: 20000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4, discardQuantity: 1, discardReason: "Opened / Unsealed" }],
      saleItems: [saleItem],
    });

    // 1. Physical batch should be 6 + 3 = 9 (NOT 8, NOT 10)
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`)).toBe(9);

    // 2. Discarded unit recorded as damage loss = 1 * 3000 = 3,000
    const damageLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(damageLoss).toBe(3000);

    // 3. Inventory valuation is 9 * 3000 = 27,000
    const inventoryValuation = scalar(`SELECT SUM(quantity * cost_price) FROM stock_batches WHERE id = '${batchId}'`);
    expect(inventoryValuation).toBe(27000);

    // 4. Total accounted for: 27,000 (inventory) + 3,000 (damage loss) = 30,000 (initial inventory asset)
    expect(Number(inventoryValuation) + damageLoss).toBe(30000);
  });
});

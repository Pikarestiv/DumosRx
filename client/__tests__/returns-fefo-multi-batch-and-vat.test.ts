import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";
import { getCurrentMonthRevenue, getStockLossTotal } from "@/lib/db/queries/finance";
import { filterPushableChanges, type PushRejection } from "@/lib/db/sync-engine/push-request";
import type { SyncChange } from "@/lib/types/sync";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Multi-batch FEFO return costing, VAT reversal and sync push", () => {
  const { run, processReturn, scalar } = setupProcessReturnHarness();

  it("handles multi-batch FEFO return with weighted cost and split restock/discard disposition", async () => {
    const productId = "p-fefo-multi";
    const batchA = "b-fefo-A";
    const batchB = "b-fefo-B";
    const sellingPrice = 8000;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Antibiotic Suspension', ${sellingPrice})`);
    // Batch A: 2 units @ 4,000
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchA}', '${productId}', 'BN-A', 2, 4000, 1)`);
    // Batch B: 3 units @ 6,000
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active)
         VALUES ('${batchB}', '${productId}', 'BN-B', 3, 6000, 1)`);

    // Sale of 4 units: consumes 2 from Batch A (all of A) and 2 from Batch B (1 left in B)
    run(`UPDATE stock_batches SET quantity = 0 WHERE id = '${batchA}'`);
    run(`UPDATE stock_batches SET quantity = 1 WHERE id = '${batchB}'`);

    const saleId = "s-fefo-multi";
    const totalCogs = 2 * 4000 + 2 * 6000; // 20,000
    const weightedUnitCost = totalCogs / 4; // 5,000

    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-FEFO-MULTI', 32000, 32000, 32000, 'cash', 'completed', '2026-11-12T10:00:00.000Z')`);

    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-fefo', '${saleId}', '${productId}', 4, ${sellingPrice}, ${weightedUnitCost}, 32000)`);

    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-A', 'si-fefo', '${batchA}', 2),
                ('sib-B', 'si-fefo', '${batchB}', 2)`);

    const sale = { id: saleId, subtotal: 32000, total_amount: 32000, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-fefo", sale_id: saleId, product_id: productId, quantity: 4, unit_price: sellingPrice, cost_price: weightedUnitCost, total_price: 32000 };

    // Return all 4 units: 2 restocked, 2 discarded
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Patient allergic reaction, vials partially unsealed",
      totalRefund: 32000,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4, discardQuantity: 2, discardReason: "Opened / Unsealed" }],
      saleItems: [saleItem],
    });

    // 1. FEFO Restock: 2 restocked units restore Batch A first (its consumed allocation)
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchA}'`)).toBe(2);
    // Batch B was not reached by the 2 restocked units, stays at 1
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = '${batchB}'`)).toBe(1);

    // 2. Discarded units recorded as damage loss: 2 * 5,000 = 10,000
    const damageLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(damageLoss).toBe(10000);

    // 3. COGS Reversal: returned_cogs equals full 4 * 5,000 = 20,000
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
    expect(returnedCogs).toBe(20000);

    // 4. Inventory Valuation: Batch A (2 * 4000 = 8000) + Batch B (1 * 6000 = 6000) = 14,000
    const currentValuation = scalar(`SELECT SUM(quantity * cost_price) FROM stock_batches WHERE product_id = '${productId}'`);
    expect(currentValuation).toBe(14000);

    // Total Accounted For: 14,000 (on-hand) + 10,000 (damage loss) = 24,000
    // (Starting inventory was 2 * 4,000 + 3 * 6,000 = 26,000; exactly 2,000 difference is the 1 unit of Batch B never returned).
    expect(Number(currentValuation) + damageLoss).toBe(24000);
  });

  it("reverses VAT exactly once on 100% refunded sale without double tax deduction", async () => {
    const saleId = "s-vat-refund";
    const subtotalExVat = 10000;
    const taxAmount = 750;
    const totalAmount = 10750;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('p-vat', 'Nebulizer', ${subtotalExVat})`);
    run(`INSERT INTO sales (id, transaction_number, subtotal, tax_amount, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-VAT', ${subtotalExVat}, ${taxAmount}, ${totalAmount}, ${totalAmount}, 'cash', 'completed', '2026-11-12T11:00:00.000Z')`);
    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-vat', '${saleId}', 'p-vat', 1, ${subtotalExVat}, 6000, ${subtotalExVat})`);

    const sale = { id: saleId, subtotal: subtotalExVat, tax_amount: taxAmount, total_amount: totalAmount, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-vat", sale_id: saleId, product_id: "p-vat", quantity: 1, unit_price: subtotalExVat, cost_price: 6000, total_price: subtotalExVat };

    // Full customer return and refund of totalAmount (10,750)
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Customer returned product",
      totalRefund: totalAmount,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1, discardQuantity: 0 }],
      saleItems: [saleItem],
    });

    // Net Revenue must be exactly 0: Gross (10,750) - Tax (750) - Ex-VAT Refund (10,000) = 0
    const netRevenue = await getCurrentMonthRevenue({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(netRevenue).toBe(0);
  });

  it("sync push filter allows damage-loss stock movements with null stock_batch_id", () => {
    const change: SyncChange = {
      id: 1,
      table_name: "stock_movements",
      record_id: "sm-damage-1",
      operation: "INSERT",
      created_at: new Date().toISOString(),
      payload: {
        id: "sm-damage-1",
        product_id: "p-spot-1",
        stock_batch_id: null,
        movement_type: "adjustment",
        quantity: -1,
        unit_cost: 4500,
        total_cost: 4500,
        reason: "Damage — Customer return discarded: Broken",
      },
    };

    const rejected: PushRejection[] = [];
    const pushable = filterPushableChanges([change], (id) => [id], rejected);

    expect(pushable.length).toBe(1);
    expect(rejected.length).toBe(0);
    expect(pushable[0].payload.stock_batch_id).toBeNull();
  });
});

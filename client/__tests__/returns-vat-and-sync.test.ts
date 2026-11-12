import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";
import { getCurrentMonthRevenue, getStockLossTotal } from "@/lib/db/queries/finance";
import { filterPushableChanges, type PushRejection } from "@/lib/db/sync-engine/push-request";
import { applyPulledRecord, type PullPageContext } from "@/lib/db/sync-engine/pull-apply";
import { getValidColumns } from "@/lib/db/sync-engine/schema";
import type { SyncChange } from "@/lib/types/sync";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Returns VAT reversal and sync push/pull integration", () => {
  const { run, processReturn, scalar } = setupProcessReturnHarness();

  it("reverses output VAT correctly on 100% and partial refunds without double tax deduction", async () => {
    const saleId = "s-vat-refund";
    const subtotalExVat = 10000;
    const taxAmount = 750;
    const totalAmount = 10750;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('p-vat', 'Nebulizer', ${subtotalExVat})`);
    run(`INSERT INTO sales (id, transaction_number, subtotal, tax_amount, total_amount, amount_paid, payment_method, payment_status, transaction_date)
         VALUES ('${saleId}', 'TXN-VAT', ${subtotalExVat}, ${taxAmount}, ${totalAmount}, ${totalAmount}, 'cash', 'completed', '2026-11-12T11:00:00.000Z')`);
    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-vat', '${saleId}', 'p-vat', 2, 5000, 3000, ${subtotalExVat})`);

    const sale = { id: saleId, subtotal: subtotalExVat, tax_amount: taxAmount, total_amount: totalAmount, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-vat", sale_id: saleId, product_id: "p-vat", quantity: 2, unit_price: 5000, cost_price: 3000, total_price: subtotalExVat };

    // Case 1: Partial return (1 of 2 units returned = 50% refund = 5,375)
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Partial refund 1 unit",
      totalRefund: 5375,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1, discardQuantity: 0 }],
      saleItems: [saleItem],
    });

    // Net Revenue: Gross (10,750) - Tax (750) - Ex-VAT Refund (5,000) = 5,000 (exactly 50% of 10,000 revenue)
    let netRevenue = await getCurrentMonthRevenue({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(netRevenue).toBe(5000);

    // Recomputed VAT remaining: original tax (750) - refunded tax share (375) = 375
    const refundedTaxShare = scalar(`
      SELECT SUM(r.total_refunded * s.tax_amount / s.total_amount)
      FROM returns r JOIN sales s ON s.id = r.sale_id
      WHERE r.sale_id = '${saleId}'
    `);
    expect(refundedTaxShare).toBe(375);
    const netVatPayable = taxAmount - Number(refundedTaxShare);
    expect(netVatPayable).toBe(375);

    // Case 2: Return second unit (100% refunded)
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Final 1 unit refunded",
      totalRefund: 5375,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1, discardQuantity: 0 }],
      saleItems: [saleItem],
    });

    netRevenue = await getCurrentMonthRevenue({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(netRevenue).toBe(0);

    const totalRefundedTax = scalar(`
      SELECT SUM(r.total_refunded * s.tax_amount / s.total_amount)
      FROM returns r JOIN sales s ON s.id = r.sale_id
      WHERE r.sale_id = '${saleId}'
    `);
    expect(totalRefundedTax).toBe(750);
    expect(taxAmount - Number(totalRefundedTax)).toBe(0);
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

  it("cross-device sync: Device B pulls unbatched damage movement, reflects in reports and avoids duplicates on repeated sync", async () => {
    const movementId = "sm-cross-device-1";
    const productId = "p-cross-1";
    const damageCost = 4500;

    run(`INSERT INTO products (id, name, selling_price) VALUES ('${productId}', 'Thermometer', 8000)`);

    const incomingRecord = {
      id: movementId,
      product_id: productId,
      stock_batch_id: null,
      movement_type: "adjustment",
      quantity: -1,
      unit_cost: damageCost,
      total_cost: damageCost,
      reference_type: "return",
      reason: "Damage — Customer return discarded: Broken screen",
      movement_date: "2026-11-12T12:00:00.000Z",
      _version: 1,
      _deleted: 0,
      _synced: 1,
    };

    const validColumns = await getValidColumns("stock_movements");
    const pageContext: PullPageContext = {
      touchBatch: vi.fn(),
      skippedRecords: [],
      onDeferredDelta: vi.fn(),
    };

    const result1 = await applyPulledRecord("stock_movements", incomingRecord, validColumns, pageContext);
    expect(result1.counted).toBe(true);

    const row = scalar(`SELECT total_cost FROM stock_movements WHERE id = '${movementId}'`);
    expect(row).toBe(damageCost);

    const reportedLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(reportedLoss).toBe(damageCost);

    const result2 = await applyPulledRecord("stock_movements", incomingRecord, validColumns, pageContext);
    expect(result2.skipped).toBe(false);

    const movementCount = scalar(`SELECT COUNT(*) FROM stock_movements WHERE id = '${movementId}'`);
    expect(movementCount).toBe(1);

    const repeatedLoss = await getStockLossTotal({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
    expect(repeatedLoss).toBe(damageCost);
  });
});


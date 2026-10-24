import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("useProcessReturnMutation status, stock and reseller commission", () => {
  const { run, seedSale, processReturn, scalar } = setupProcessReturnHarness();

  it("marks the sale refunded when every line item's full remaining balance is returned", async () => {
    const { sale, saleItem } = seedSale({ saleId: "s1", quantity: 4, unitPrice: 25 });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Damaged",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT payment_status FROM sales WHERE id = 's1'`)).toBe("refunded");
    expect(scalar(`SELECT total_refunded FROM returns WHERE sale_id = 's1'`)).toBe(100);
    expect(scalar(`SELECT subtotal FROM return_items`)).toBe(100);
  });

  it("marks the sale partially_refunded when a line item still has quantity left to return", async () => {
    const { sale, saleItem } = seedSale({ saleId: "s2", quantity: 4, unitPrice: 25 });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Wrong item",
      totalRefund: 25,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT payment_status FROM sales WHERE id = 's2'`)).toBe(
      "partially_refunded",
    );
  });

  it("counts a line item already fully returned by a prior return as done, so the sale flips to refunded", async () => {
    // 4 sold, 3 already returned earlier; returning the last 1 completes it.
    const { sale, saleItem } = seedSale({
      saleId: "s3",
      quantity: 4,
      unitPrice: 25,
      returnedQuantity: 3,
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Rest returned",
      totalRefund: 25,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT payment_status FROM sales WHERE id = 's3'`)).toBe("refunded");
  });

  it("sends a prescription-linked sale back to the dispense queue only on a full return", async () => {
    run(
      `INSERT INTO prescriptions (id, prescription_number, status) VALUES ('rx1', 'RX-1', 'completed')`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s4",
      quantity: 2,
      unitPrice: 50,
      prescriptionId: "rx1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Partial",
      totalRefund: 50,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });
    expect(scalar(`SELECT status FROM prescriptions WHERE id = 'rx1'`)).toBe("completed");

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Rest",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2 }],
      saleItems: [saleItem],
    });
    expect(scalar(`SELECT status FROM prescriptions WHERE id = 'rx1'`)).toBe("ready");
  });

  it("restores the returned quantity to the batch the line was drawn from", async () => {
    const { sale, saleItem } = seedSale({ saleId: "s12", quantity: 4, unitPrice: 25 });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 50,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = 'b1'`)).toBe(2);
    expect(
      scalar(`SELECT total_cost FROM stock_movements WHERE movement_type = 'return'`),
    ).toBe(10);
  });

  it("reduces a pending reseller commission to match the lines that survive a return", async () => {
    const { sale, saleItem } = seedSale({ saleId: "s-rs", quantity: 4, unitPrice: 150 });
    run(
      `UPDATE sales SET is_reseller_sale = 1, markup_type = 'reseller', reseller_commission_percentage = 10,
        reseller_markup_amount = 200, reseller_commission_amount = 20 WHERE id = 's-rs'`,
    );
    run(`UPDATE sale_items SET list_price = 100 WHERE id = 'si1'`);

    await processReturn({
      sale: { ...sale, is_reseller_sale: 1, markup_type: "reseller", reseller_commission_percentage: 10 },
      userId: "user-1",
      reason: "Wrong item",
      totalRefund: 150,
      itemsToReturn: [{ ...saleItem, list_price: 100, returnQuantity: 1 }],
      saleItems: [{ ...saleItem, list_price: 100 }],
    });

    expect(scalar(`SELECT reseller_markup_amount FROM sales WHERE id = 's-rs'`)).toBe(150);
    expect(scalar(`SELECT reseller_commission_amount FROM sales WHERE id = 's-rs'`)).toBe(15);
  });

  it("records owed-back commission from the stored row, not the stale sale prop, and keeps the paid figures", async () => {
    const { sale, saleItem } = seedSale({ saleId: "s-stale", quantity: 4, unitPrice: 150 });
    run(
      `UPDATE sales SET is_reseller_sale = 1, markup_type = 'reseller', reseller_commission_percentage = 10,
        reseller_markup_amount = 200, reseller_commission_amount = 20, reseller_commission_redeemed = 1,
        reseller_commission_redeemed_amount = 20, reseller_commission_claim_type = 'commission' WHERE id = 's-stale'`,
    );
    run(`UPDATE sale_items SET list_price = 100 WHERE id = 'si1'`);

    await processReturn({
      sale: { ...sale, is_reseller_sale: 1, markup_type: "reseller", reseller_commission_percentage: 10, reseller_commission_redeemed: 0 },
      userId: "user-1",
      reason: "Wrong item",
      totalRefund: 150,
      itemsToReturn: [{ ...saleItem, list_price: 100, returnQuantity: 1 }],
      saleItems: [{ ...saleItem, list_price: 100 }],
    });

    expect(scalar(`SELECT reseller_commission_amount FROM sales WHERE id = 's-stale'`)).toBe(20);
    expect(scalar(`SELECT reseller_commission_redeemed_amount FROM sales WHERE id = 's-stale'`)).toBe(20);
    expect(scalar(`SELECT reseller_commission_owed_back FROM sales WHERE id = 's-stale'`)).toBe(5);
    expect(scalar(`SELECT reseller_markup_amount FROM sales WHERE id = 's-stale'`)).toBe(150);
  });
});

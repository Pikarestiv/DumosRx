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

  it("handles multi-item split disposition: 3A (1 discarded, 2 restocked), 12B (4 discarded, 8 restocked), 5C (0 discarded, 5 restocked)", async () => {
    // Seed 3 products and their initial sold batches
    run(`INSERT INTO products (id, name, selling_price) VALUES ('pA', 'Product A', 100), ('pB', 'Product B', 50), ('pC', 'Product C', 200)`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price) VALUES
      ('bA', 'pA', 'BA-1', 0, 60),
      ('bB', 'pB', 'BB-1', 0, 30),
      ('bC', 'pC', 'BC-1', 0, 120)`);

    const saleId = "s-split";
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status)
         VALUES ('${saleId}', 'TXN-SPLIT', 1900, 1900, 1900, 'cash', 'completed')`);

    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price) VALUES
      ('siA', '${saleId}', 'pA', 3, 100, 60, 300),
      ('siB', '${saleId}', 'pB', 12, 50, 30, 600),
      ('siC', '${saleId}', 'pC', 5, 200, 120, 1000)`);

    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity) VALUES
      ('sibA', 'siA', 'bA', 3),
      ('sibB', 'siB', 'bB', 12),
      ('sibC', 'siC', 'bC', 5)`);

    const sale = {
      id: saleId,
      subtotal: 1900,
      total_amount: 1900,
      payment_method: "cash",
      payment_status: "completed",
    };

    const itemA = { id: "siA", sale_id: saleId, product_id: "pA", quantity: 3, unit_price: 100, cost_price: 60, total_price: 300 };
    const itemB = { id: "siB", sale_id: saleId, product_id: "pB", quantity: 12, unit_price: 50, cost_price: 30, total_price: 600 };
    const itemC = { id: "siC", sale_id: saleId, product_id: "pC", quantity: 5, unit_price: 200, cost_price: 120, total_price: 1000 };

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Customer return with partial damages",
      totalRefund: 1900,
      itemsToReturn: [
        { ...itemA, returnQuantity: 3, discardQuantity: 1, discardReason: "Damaged / Broken" },
        { ...itemB, returnQuantity: 12, discardQuantity: 4, discardReason: "Opened / Unsealed" },
        { ...itemC, returnQuantity: 5, discardQuantity: 0 },
      ],
      saleItems: [itemA, itemB, itemC],
    });

    // 1. Stock batches: only sound units are restocked
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = 'bA'`)).toBe(2); // 3 returned - 1 discarded = 2 restocked
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = 'bB'`)).toBe(8); // 12 returned - 4 discarded = 8 restocked
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = 'bC'`)).toBe(5); // 5 returned - 0 discarded = 5 restocked

    // 2. Return items records full returned quantities for customer refund
    expect(scalar(`SELECT quantity FROM return_items WHERE product_id = 'pA'`)).toBe(3);
    expect(scalar(`SELECT quantity FROM return_items WHERE product_id = 'pB'`)).toBe(12);
    expect(scalar(`SELECT quantity FROM return_items WHERE product_id = 'pC'`)).toBe(5);

    // 3. Stock movements: restocked items logged as movement_type 'return'
    expect(scalar(`SELECT quantity FROM stock_movements WHERE product_id = 'pA' AND movement_type = 'return'`)).toBe(2);
    expect(scalar(`SELECT quantity FROM stock_movements WHERE product_id = 'pB' AND movement_type = 'return'`)).toBe(8);
    expect(scalar(`SELECT quantity FROM stock_movements WHERE product_id = 'pC' AND movement_type = 'return'`)).toBe(5);

    // 4. Stock movements: discarded items logged as movement_type 'adjustment' with Damage reason and cost basis
    expect(scalar(`SELECT quantity FROM stock_movements WHERE product_id = 'pA' AND movement_type = 'adjustment'`)).toBe(-1);
    expect(scalar(`SELECT total_cost FROM stock_movements WHERE product_id = 'pA' AND movement_type = 'adjustment'`)).toBe(60); // 1 * 60
    expect(scalar(`SELECT reason FROM stock_movements WHERE product_id = 'pA' AND movement_type = 'adjustment'`)).toContain("Damage — Customer return discarded: Damaged / Broken");

    expect(scalar(`SELECT quantity FROM stock_movements WHERE product_id = 'pB' AND movement_type = 'adjustment'`)).toBe(-4);
    expect(scalar(`SELECT total_cost FROM stock_movements WHERE product_id = 'pB' AND movement_type = 'adjustment'`)).toBe(120); // 4 * 30
    expect(scalar(`SELECT reason FROM stock_movements WHERE product_id = 'pB' AND movement_type = 'adjustment'`)).toContain("Damage — Customer return discarded: Opened / Unsealed");

    // Product C had 0 discarded, so no adjustment movement
    expect(scalar(`SELECT COUNT(*) FROM stock_movements WHERE product_id = 'pC' AND movement_type = 'adjustment'`)).toBe(0);

    // 5. Total damage loss recognized by finance query: 60 (for A) + 120 (for B) = 180
    expect(scalar(`SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) FROM stock_movements WHERE movement_type = 'adjustment' AND reason LIKE 'Damage%'`)).toBe(180);
  });

  it("does not touch stock batches when 100% of the returned quantity is discarded", async () => {
    run(`INSERT INTO products (id, name, selling_price) VALUES ('p-damaged', 'Damaged Med', 80)`);
    run(`INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price) VALUES ('b-dmg', 'p-damaged', 'BD-1', 0, 40)`);

    const saleId = "s-all-damaged";
    run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, amount_paid, payment_method, payment_status)
         VALUES ('${saleId}', 'TXN-ALL-DMG', 160, 160, 160, 'cash', 'completed')`);
    run(`INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
         VALUES ('si-dmg', '${saleId}', 'p-damaged', 2, 80, 40, 160)`);
    run(`INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
         VALUES ('sib-dmg', 'si-dmg', 'b-dmg', 2)`);

    const sale = { id: saleId, subtotal: 160, total_amount: 160, payment_method: "cash", payment_status: "completed" };
    const saleItem = { id: "si-dmg", sale_id: saleId, product_id: "p-damaged", quantity: 2, unit_price: 80, cost_price: 40, total_price: 160 };

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Broken vials",
      totalRefund: 160,
      itemsToReturn: [{ ...saleItem, returnQuantity: 2, discardQuantity: 2, discardReason: "Damaged / Broken" }],
      saleItems: [saleItem],
    });

    // Stock batch stays at 0 (damaged medicine does not re-enter saleable stock)
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = 'b-dmg'`)).toBe(0);

    // No return movement was inserted
    expect(scalar(`SELECT COUNT(*) FROM stock_movements WHERE product_id = 'p-damaged' AND movement_type = 'return'`)).toBe(0);

    // Adjustment movement recorded for the full discarded quantity
    expect(scalar(`SELECT quantity FROM stock_movements WHERE product_id = 'p-damaged' AND movement_type = 'adjustment'`)).toBe(-2);
    expect(scalar(`SELECT total_cost FROM stock_movements WHERE product_id = 'p-damaged' AND movement_type = 'adjustment'`)).toBe(80);
  });
});

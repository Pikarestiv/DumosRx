import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("POS State Machine: Settled Credit Returns & Debt Invariants", () => {
  const { run, seedSale, processReturn, scalar } = setupProcessReturnHarness();

  it("settled credit sale return does not corrupt zero balance and records full refund", async () => {
    // Customer bought on credit for 100, then fully settled it (amount_paid = 100, balance = 0).
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 0, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s-settled-1",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "credit",
      amountPaid: 100,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Product recall",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    // Customer balance must remain 0 (not negative, not erroneously incremented).
    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(0);
    // Returns table records the full refund amount.
    expect(scalar(`SELECT total_refunded FROM returns WHERE sale_id = 's-settled-1'`)).toBe(100);
    expect(scalar(`SELECT payment_status FROM sales WHERE id = 's-settled-1'`)).toBe("refunded");
  });

  it("settled credit sale return with existing other debt applies surplus to remaining customer balance", async () => {
    // Customer settled this sale (100 paid), but has 60 debt from another transaction.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 60, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s-settled-2",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "credit",
      amountPaid: 100,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Customer preference",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    // The 100 surplus offsets the 60 outstanding balance down to 0.
    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(0);
    expect(scalar(`SELECT total_refunded FROM returns WHERE sale_id = 's-settled-2'`)).toBe(100);
  });

  it("partially settled credit sale return relieves remaining debt and offsets customer balance", async () => {
    // 100 total sale, 40 paid (owes 60 on this sale). Customer overall balance is 60.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 60, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s-part-1",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "credit",
      amountPaid: 40,
      customerId: "c1",
    });

    // Customer returns all 4 items (100 refund).
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Defective",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    // Debt of 60 on this sale is relieved, customer balance drops to 0.
    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(0);
    expect(scalar(`SELECT amount_paid FROM sales WHERE id = 's-part-1'`)).toBe(100);
    expect(scalar(`SELECT payment_status FROM sales WHERE id = 's-part-1'`)).toBe("refunded");
  });

  it("mixed credit sale return with partial settlement prorates credit refund correctly", async () => {
    // 100 total: 50 cash + 50 credit. Amount paid = 80 (cash 50 + 30 of credit paid, owes 20).
    // Customer overall balance = 20.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 20, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s-mixed-part-1",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "mixed",
      paymentDetails: JSON.stringify({
        splits: [
          { method: "cash", amount: 50 },
          { method: "credit", amount: 50 },
        ],
      }),
      amountPaid: 80,
      customerId: "c1",
    });

    // Full return of 100. Credit portion = 50% = 50.
    // Owed on sale = 100 - 80 = 20.
    // Forgiven on sale = 20 (amount_paid becomes 80 + 20 = 100).
    // Surplus = 30, customer balance drops from 20 to 0.
    await processReturn({
      sale,
      userId: "user-1",
      reason: "Expired",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(0);
    expect(scalar(`SELECT amount_paid FROM sales WHERE id = 's-mixed-part-1'`)).toBe(100);
  });
});

import { describe, it, expect, vi } from "vitest";
import { setupProcessReturnHarness } from "./helpers/process-return-harness";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// useProcessReturnMutation carries the money and points consequences of a customer return:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-process-return-credit-and-loyalty-test-ts-L17
describe("useProcessReturnMutation credit and loyalty", () => {
  const { run, seedSale, processReturn, scalar } = setupProcessReturnHarness();

  it("forgives the whole refund off a fully-unpaid credit sale's debt and credits amount_paid", async () => {
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 100, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s5",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "credit",
      amountPaid: 0,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(0);
    expect(scalar(`SELECT amount_paid FROM sales WHERE id = 's5'`)).toBe(100);
  });

  it("caps debt forgiveness at what the credit sale still owes when it was already part-paid", async () => {
    // 100 sale, 70 already paid, so only 30 of the 100 refund is debt relief.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 30, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s6",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "credit",
      amountPaid: 70,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(0);
    expect(scalar(`SELECT amount_paid FROM sales WHERE id = 's6'`)).toBe(100);
  });

  it("prorates debt forgiveness by the credit share of a mixed-payment sale", async () => {
    // 100 sale: 70 cash + 30 credit, 70 paid. A 25 refund forgives only the
    // credit share of it: 25 * 0.3 = 7.5, well under the 30 still owed.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 90, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s7",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "mixed",
      paymentDetails: JSON.stringify({
        splits: [
          { method: "cash", amount: 70 },
          { method: "credit", amount: 30 },
        ],
      }),
      amountPaid: 70,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 25,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(82.5);
    expect(scalar(`SELECT amount_paid FROM sales WHERE id = 's7'`)).toBe(77.5);
  });

  it("reads a bare-array payment_details as the split list", async () => {
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 90, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s7b",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "mixed",
      paymentDetails: JSON.stringify([
        { method: "cash", amount: 70 },
        { method: "credit", amount: 30 },
      ]),
      amountPaid: 70,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 25,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(82.5);
  });

  it("leaves the customer's balance alone when a mixed sale's payment_details is unparseable", async () => {
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 90, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s8",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "mixed",
      paymentDetails: "{not json",
      amountPaid: 60,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(90);
    expect(scalar(`SELECT amount_paid FROM sales WHERE id = 's8'`)).toBe(60);
  });

  it("never touches the customer's debt for a non-credit sale", async () => {
    // amount_paid deliberately left at 0 so the sale still "owes" 100: if the
    // credit branch were entered at all it would forgive debt here.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 90, 0)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s9",
      quantity: 4,
      unitPrice: 25,
      paymentMethod: "cash",
      amountPaid: 0,
      customerId: "c1",
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 100,
      itemsToReturn: [{ ...saleItem, returnQuantity: 4 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT outstanding_balance FROM customers WHERE id = 'c1'`)).toBe(90);
    expect(scalar(`SELECT amount_paid FROM sales WHERE id = 's9'`)).toBe(0);
  });

  it("claws back earned points and refunds redeemed points prorated by the returned share", async () => {
    // 100 subtotal, 25 returned => 25% share of 20 earned / 200 redeemed.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 0, 500)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s10",
      quantity: 4,
      unitPrice: 25,
      customerId: "c1",
      pointsEarned: 20,
      pointsRedeemed: 200,
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "One back",
      totalRefund: 25,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    // 500 + floor(200*0.25) - floor(20*0.25) = 500 + 50 - 5 = 545
    expect(scalar(`SELECT loyalty_points FROM customers WHERE id = 'c1'`)).toBe(545);
    expect(
      scalar(`SELECT points FROM loyalty_transactions WHERE type = 'earned'`),
    ).toBe(-5);
    expect(
      scalar(`SELECT points FROM loyalty_transactions WHERE type = 'redeemed'`),
    ).toBe(50);
  });

  it("writes no loyalty ledger rows when the prorated share rounds down to zero points", async () => {
    // 25% of 2 earned points is 0.5, which floors to 0: a partial return too
    // small to be worth a whole point must not move the balance at all.
    run(
      `INSERT INTO customers (id, first_name, outstanding_balance, loyalty_points) VALUES ('c1', 'Ada', 0, 500)`,
    );
    const { sale, saleItem } = seedSale({
      saleId: "s11",
      quantity: 4,
      unitPrice: 25,
      customerId: "c1",
      pointsEarned: 2,
    });

    await processReturn({
      sale,
      userId: "user-1",
      reason: "Returned",
      totalRefund: 25,
      itemsToReturn: [{ ...saleItem, returnQuantity: 1 }],
      saleItems: [saleItem],
    });

    expect(scalar(`SELECT COUNT(*) FROM loyalty_transactions`)).toBe(0);
    expect(scalar(`SELECT loyalty_points FROM customers WHERE id = 'c1'`)).toBe(500);
  });
});

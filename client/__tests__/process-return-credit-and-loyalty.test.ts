import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { ReactNode } from "react";
import React from "react";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/**
 * useProcessReturnMutation carries the money and points consequences of a
 * customer return: how much of a credit sale's debt is forgiven, how the
 * sale's payment_status flips, whether a prescription re-enters the dispense
 * queue, and how many loyalty points are clawed back or refunded. None of
 * that had test coverage.
 */
describe("useProcessReturnMutation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useProcessReturnMutation: typeof import("@/lib/hooks/use-process-return-mutation").useProcessReturnMutation;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const mod = await import("@/lib/hooks/use-process-return-mutation");
    useProcessReturnMutation = mod.useProcessReturnMutation;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    );
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM sales; DELETE FROM sale_items; DELETE FROM sale_item_batches;
      DELETE FROM returns; DELETE FROM return_items; DELETE FROM customers;
      DELETE FROM prescriptions; DELETE FROM loyalty_transactions;
      DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM products;
      DELETE FROM audit_logs;
    `);
    core.setActiveStoreId(null);
    localStorage.setItem("dumos_user", JSON.stringify({ id: "user-1" }));
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  /** One product + one stock batch + one sale line, all wired together. */
  function seedSale(opts: {
    saleId: string;
    quantity: number;
    unitPrice: number;
    paymentMethod?: string;
    paymentDetails?: string | null;
    amountPaid?: number;
    customerId?: string | null;
    prescriptionId?: string | null;
    pointsEarned?: number;
    pointsRedeemed?: number;
    returnedQuantity?: number;
  }) {
    const subtotal = opts.quantity * opts.unitPrice;
    db.run(
      `INSERT INTO products (id, name, selling_price) VALUES ('p1', 'Panadol', ?)`,
      [opts.unitPrice],
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price)
       VALUES ('b1', 'p1', 'B-1', 0, 5)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, customer_id, prescription_id, subtotal,
        total_amount, amount_paid, payment_method, payment_details, payment_status,
        points_earned, points_redeemed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
      [
        opts.saleId,
        `TXN-${opts.saleId}`,
        opts.customerId ?? null,
        opts.prescriptionId ?? null,
        subtotal,
        subtotal,
        opts.amountPaid ?? 0,
        opts.paymentMethod ?? "cash",
        opts.paymentDetails ?? null,
        opts.pointsEarned ?? 0,
        opts.pointsRedeemed ?? 0,
      ],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
       VALUES ('si1', ?, 'p1', ?, ?, 5, ?)`,
      [opts.saleId, opts.quantity, opts.unitPrice, subtotal],
    );
    db.run(
      `INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity)
       VALUES ('sib1', 'si1', 'b1', ?)`,
      [opts.quantity],
    );

    const saleItem = {
      id: "si1",
      sale_id: opts.saleId,
      product_id: "p1",
      product_name: "Panadol",
      quantity: opts.quantity,
      unit_price: opts.unitPrice,
      cost_price: 5,
      total_price: subtotal,
      returned_quantity: opts.returnedQuantity ?? 0,
    };
    const sale = {
      id: opts.saleId,
      transaction_number: `TXN-${opts.saleId}`,
      customer_id: opts.customerId ?? undefined,
      prescription_id: opts.prescriptionId ?? undefined,
      subtotal,
      total_amount: subtotal,
      amount_paid: opts.amountPaid ?? 0,
      payment_method: opts.paymentMethod ?? "cash",
      payment_details: opts.paymentDetails ?? undefined,
      points_earned: opts.pointsEarned ?? 0,
      points_redeemed: opts.pointsRedeemed ?? 0,
    };
    return { sale, saleItem, subtotal };
  }

  async function processReturn(params: Record<string, unknown>) {
    const { result } = renderHook(() => useProcessReturnMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(params as never);
    });
  }

  function scalar(sql: string): unknown {
    const rows = db.exec(sql);
    return rows.length ? rows[0].values[0][0] : undefined;
  }

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
    db.run(
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

  it("forgives the whole refund off a fully-unpaid credit sale's debt and credits amount_paid", async () => {
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
    db.run(
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
});

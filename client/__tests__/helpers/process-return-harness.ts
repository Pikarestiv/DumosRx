import { beforeAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { ReactNode } from "react";
import React from "react";

export interface SeedSaleOptions {
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
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

export function setupProcessReturnHarness() {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useProcessReturnMutation: typeof import("@/lib/hooks/use-process-return-mutation").useProcessReturnMutation;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ useProcessReturnMutation } = await import("@/lib/hooks/use-process-return-mutation"));

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

  function seedSale(opts: SeedSaleOptions) {
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

  return {
    run: (sql: string) => db.run(sql),
    seedSale,
    processReturn,
    scalar,
  };
}

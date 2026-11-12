import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { type ReactNode } from "react";
import type { CartItem } from "@/lib/hooks/use-pos-cart-store";
import {
  createService,
  getServices,
  getServiceById,
  updateServiceDetails,
  deleteService,
} from "@/lib/db/queries/services";
import { getTransactionDetails } from "@/lib/db/queries/sales";
import { saleToReceiptTransaction } from "@/components/pos/sale-to-receipt-transaction";

const STORE_ID = "store-test-1";

const baseSaleOptions = {
  tax: 0, discount: 0, rawDiscount: 0, discountType: "fixed" as const,
  redeemedOption: null, selectedCustomer: null, canUseLoyaltyProgram: false,
  isResellerSale: false, markupType: null, resellerCommissionPercentage: 0,
  resellerMarkup: 0, resellerCommissionAmount: 0, paymentMethod: "cash" as const,
  paymentSplits: [], selectedAccountId: "", saleNote: "", isRefillDispense: false,
  cashierId: "cashier-1", earnedPoints: 0, transactionNumber: "TXN-TEST",
  amountPaid: "11000", change: 0,
};

function queryWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("Service POS (Services catalog, mixed cart, checkout, receipt, and returns)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let writeSaleTransaction: typeof import("@/lib/hooks/pos-sale-writer").writeSaleTransaction;
  let useProcessReturnMutation: typeof import("@/lib/hooks/use-process-return-mutation").useProcessReturnMutation;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ writeSaleTransaction } = await import("@/lib/hooks/pos-sale-writer"));
    ({ useProcessReturnMutation } = await import("@/lib/hooks/use-process-return-mutation"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
    localStorage.setItem("dumos_user", JSON.stringify({ id: "cashier-1" }));
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM services; DELETE FROM sale_services; DELETE FROM return_services;
      DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;
      DELETE FROM sale_items; DELETE FROM sale_item_batches; DELETE FROM sales;
      DELETE FROM returns; DELETE FROM return_items; DELETE FROM audit_logs;
    `);
  });

  function scalar(sql: string): unknown {
    const res = db.exec(sql);
    return res.length && res[0].values.length ? res[0].values[0][0] : undefined;
  }

  it("creates, filters, updates, and soft deletes services in local SQLite catalog", async () => {
    const s1Id = await createService({
      store_id: STORE_ID,
      name: "Full Body Massage",
      code: "SRV-MASSAGE",
      description: "60-minute relaxing Swedish massage",
      category: "Spa & Wellness",
      price: 15000,
      is_active: 1,
    });
    const s2Id = await createService({
      store_id: STORE_ID,
      name: "Facial Treatment",
      code: "SRV-FACIAL",
      description: "Deep cleansing facial exfoliation",
      category: "Skincare",
      price: 8000,
      is_active: 1,
    });

    const allActive = await getServices({ storeId: STORE_ID });
    expect(allActive).toHaveLength(2);

    const spaOnly = await getServices({ storeId: STORE_ID, category: "Spa & Wellness" });
    expect(spaOnly).toHaveLength(1);
    expect(spaOnly[0].name).toBe("Full Body Massage");

    const searchMatch = await getServices({ storeId: STORE_ID, search: "facial" });
    expect(searchMatch).toHaveLength(1);
    expect(searchMatch[0].id).toBe(s2Id);

    await updateServiceDetails(s1Id, { price: 18000, is_active: 0 });
    const updatedS1 = await getServiceById(s1Id);
    expect(updatedS1?.price).toBe(18000);
    expect(updatedS1?.is_active).toBe(0);

    const activeAfterDeactivate = await getServices({ storeId: STORE_ID, activeOnly: true });
    expect(activeAfterDeactivate).toHaveLength(1);
    expect(activeAfterDeactivate[0].id).toBe(s2Id);

    await deleteService(s2Id);
    const activeAfterDelete = await getServices({ storeId: STORE_ID, activeOnly: false });
    expect(activeAfterDelete.map((s) => s.id)).not.toContain(s2Id);
  });

  it("checks out a mixed cart with physical product and service, updating inventory only for product", async () => {
    db.run(
      `INSERT INTO products (id, store_id, name, selling_price)
       VALUES ('prod-1', '${STORE_ID}', 'Moisturizing Cream', 3000)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price)
       VALUES ('batch-1', 'prod-1', 'BAT-001', 10, 1500)`,
    );

    const serviceId = await createService({
      store_id: STORE_ID,
      name: "Pedicure Deluxe",
      code: "SRV-PEDI",
      category: "Spa & Wellness",
      price: 5000,
      is_active: 1,
    });

    const cart: CartItem[] = [
      {
        id: "prod-1",
        name: "Moisturizing Cream",
        generic_name: "",
        strength: "",
        unit_price: 3000,
        original_unit_price: 3000,
        cost_price: 1500,
        stock: 10,
        quantity: 2,
        subtotal: 6000,
        item_type: "product",
      },
      {
        id: serviceId,
        name: "Pedicure Deluxe",
        generic_name: "Spa & Wellness",
        strength: "",
        unit_price: 5000,
        original_unit_price: 5000,
        cost_price: 0,
        stock: null,
        quantity: 1,
        subtotal: 5000,
        item_type: "service",
      },
    ];

    const saleId = await writeSaleTransaction({
      ...baseSaleOptions,
      cart,
      subtotal: 11000,
      total: 11000,
      amountPaid: "11000",
    });

    expect(saleId).toBeDefined();

    const saleSubtotal = scalar(`SELECT subtotal FROM sales WHERE id = '${saleId}'`);
    const saleTotal = scalar(`SELECT total_amount FROM sales WHERE id = '${saleId}'`);
    expect(saleSubtotal).toBe(11000);
    expect(saleTotal).toBe(11000);

    const saleItemCount = scalar(`SELECT COUNT(*) FROM sale_items WHERE sale_id = '${saleId}'`);
    expect(saleItemCount).toBe(1);

    const saleServiceCount = scalar(`SELECT COUNT(*) FROM sale_services WHERE sale_id = '${saleId}'`);
    expect(saleServiceCount).toBe(1);

    const savedServicePrice = scalar(`SELECT unit_price FROM sale_services WHERE sale_id = '${saleId}'`);
    const savedServiceName = scalar(`SELECT service_name FROM sale_services WHERE sale_id = '${saleId}'`);
    expect(savedServicePrice).toBe(5000);
    expect(savedServiceName).toBe("Pedicure Deluxe");

    const batchQty = scalar(`SELECT quantity FROM stock_batches WHERE id = 'batch-1'`);
    expect(batchQty).toBe(8);

    const movements = db.exec(
      `SELECT movement_type, quantity, product_id FROM stock_movements WHERE reference_id = '${saleId}'`,
    );
    expect(movements[0].values).toHaveLength(1);
    expect(movements[0].values[0][0]).toBe("sale");
    expect(movements[0].values[0][1]).toBe(-2);
    expect(movements[0].values[0][2]).toBe("prod-1");

    const details = await getTransactionDetails(saleId);
    expect(details.items).toHaveLength(1);
    expect(details.items[0].product_name).toBe("Moisturizing Cream");
    expect(details.services).toHaveLength(1);
    expect(details.services[0].service_name).toBe("Pedicure Deluxe");
    expect(details.services[0].unit_price).toBe(5000);

    const receipt = saleToReceiptTransaction(
      {
        id: saleId,
        subtotal: 11000,
        total_amount: 11000,
        payment_method: "cash",
        amount_paid: 11000,
        created_at: new Date().toISOString(),
      } as never,
      [...details.items, ...details.services],
    );
    expect(receipt.items).toHaveLength(2);
    expect(receipt.items[0].name).toBe("Moisturizing Cream");
    expect(receipt.items[1].name).toBe("Pedicure Deluxe (Service)");
  });

  it("processes a service return without touching physical inventory and marks sale refunded", async () => {
    const serviceId = await createService({
      store_id: STORE_ID,
      name: "Hair Styling",
      code: "SRV-HAIR",
      price: 12000,
      is_active: 1,
    });

    const cart: CartItem[] = [
      {
        id: serviceId,
        name: "Hair Styling",
        generic_name: "Salon",
        strength: "",
        unit_price: 12000,
        original_unit_price: 12000,
        cost_price: 0,
        stock: null,
        quantity: 1,
        subtotal: 12000,
        item_type: "service",
      },
    ];

    const saleId = await writeSaleTransaction({
      ...baseSaleOptions,
      cart,
      subtotal: 12000,
      total: 12000,
      amountPaid: "12000",
    });

    const details = await getTransactionDetails(saleId);
    expect(details.services).toHaveLength(1);
    const saleServiceRow = details.services[0];

    const { result } = renderHook(() => useProcessReturnMutation(), { wrapper: queryWrapper });
    await act(async () => {
      await result.current.mutateAsync({
        sale: {
          id: saleId,
          subtotal: 12000,
          total_amount: 12000,
          payment_method: "cash",
        } as never,
        userId: "cashier-1",
        reason: "Customer was unhappy with the hairstyle",
        totalRefund: 12000,
        itemsToReturn: [],
        saleItems: [],
        servicesToReturn: [
          {
            id: saleServiceRow.id,
            saleServiceId: saleServiceRow.id,
            serviceId: saleServiceRow.service_id,
            serviceName: saleServiceRow.service_name,
            quantity: 1,
            returnQuantity: 1,
            unitPrice: 12000,
          },
        ],
        saleServices: [
          {
            id: saleServiceRow.id,
            saleServiceId: saleServiceRow.id,
            serviceId: saleServiceRow.service_id,
            serviceName: saleServiceRow.service_name,
            quantity: 1,
            returnQuantity: 0,
            unitPrice: 12000,
          },
        ],
      });
    });

    const returnCount = scalar(`SELECT COUNT(*) FROM returns WHERE sale_id = '${saleId}'`);
    expect(returnCount).toBe(1);

    const returnSvcCount = scalar(
      `SELECT COUNT(*) FROM return_services WHERE sale_service_id = '${saleServiceRow.id}'`,
    );
    expect(returnSvcCount).toBe(1);

    const refundedAmount = scalar(`SELECT total_refunded FROM returns WHERE sale_id = '${saleId}'`);
    expect(refundedAmount).toBe(12000);

    const salePaymentStatus = scalar(`SELECT payment_status FROM sales WHERE id = '${saleId}'`);
    expect(salePaymentStatus).toBe("refunded");

    const movementCount = scalar(`SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'return'`);
    expect(movementCount ?? 0).toBe(0);

    const updatedDetails = await getTransactionDetails(saleId);
    expect(updatedDetails.services[0].returned_quantity).toBe(1);
  });
});

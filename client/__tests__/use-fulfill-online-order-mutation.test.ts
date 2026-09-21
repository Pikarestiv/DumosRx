import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";
import type { OnlineOrder } from "@/lib/types/online-order";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    fulfillOnlineOrder: vi.fn(async () => undefined),
  },
}));

const insertMock = vi.fn(async () => "sale-id");
vi.mock("@/lib/db/base-helpers", () => ({
  insert: insertMock,
}));

vi.mock("@/lib/db/queries/inventory", () => ({
  getBatchesForProduct: vi.fn(async () => [{ quantity: 10, cost_price: 500 }]),
  recordSaleItemStock: vi.fn(async () => undefined),
}));

/**
 * Regression test: this hook's sales insert previously wrote
 * receipt_number/status/customer_name, none of which exist on the `sales`
 * table (it has transaction_number UNIQUE NOT NULL, payment_status, and
 * customer_id instead) - the insert threw "no such column" on every real
 * fulfillment, and transaction_number (required) was never set at all.
 */
describe("useFulfillOnlineOrderMutation", () => {
  beforeEach(() => {
    insertMock.mockClear();
  });

  function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient();
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }

  const order: OnlineOrder = {
    id: "order-1",
    customer_name: "Jane Doe",
    total_amount: 5000,
    payment_method: "cash",
    order_status: "pending",
    created_at: new Date().toISOString(),
    items: [{ id: "oi1", product_id: "p1", quantity: 2, unit_price: 2500, subtotal: 5000 }],
  };

  it("inserts a sales row with only real sales columns, a non-empty unique transaction_number, and the customer name in notes", async () => {
    const { useFulfillOnlineOrderMutation } = await import(
      "@/lib/hooks/use-fulfill-online-order-mutation"
    );
    const { result } = renderHook(() => useFulfillOnlineOrderMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ order, storeId: "store1", cashierId: "cashier1" });
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const [table, record] = insertMock.mock.calls[0];
    expect(table).toBe("sales");

    // Only real sales columns.
    expect(record).not.toHaveProperty("receipt_number");
    expect(record).not.toHaveProperty("status");
    expect(record).not.toHaveProperty("customer_name");

    expect(typeof record.transaction_number).toBe("string");
    expect(record.transaction_number.length).toBeGreaterThan(0);
    expect(record.payment_status).toBe("paid");
    expect(record.notes).toBe("Online order - Jane Doe");
  });

  it("generates a distinct transaction_number per fulfillment (not derived from a shared order-id prefix)", async () => {
    const { useFulfillOnlineOrderMutation } = await import(
      "@/lib/hooks/use-fulfill-online-order-mutation"
    );
    const { result: r1 } = renderHook(() => useFulfillOnlineOrderMutation(), { wrapper });
    const { result: r2 } = renderHook(() => useFulfillOnlineOrderMutation(), { wrapper });

    await act(async () => {
      await r1.current.mutateAsync({ order, storeId: "store1", cashierId: "cashier1" });
    });
    await act(async () => {
      await r2.current.mutateAsync({ order, storeId: "store1", cashierId: "cashier1" });
    });

    const first = insertMock.mock.calls[0][1].transaction_number;
    const second = insertMock.mock.calls[1][1].transaction_number;
    expect(first).not.toBe(second);
  });
});

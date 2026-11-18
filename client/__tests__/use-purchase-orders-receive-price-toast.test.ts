import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";
import { toast } from "sonner";

const receivePurchaseOrder = vi.fn(() => Promise.resolve("received"));
const getPurchaseOrders = vi.fn(() => Promise.resolve({ data: [] }));

vi.mock("@/lib/db/local-database", () => ({
  getPurchaseOrders: (...args: unknown[]) => (getPurchaseOrders as (...a: unknown[]) => unknown)(...args),
  receivePurchaseOrder: (...args: unknown[]) => (receivePurchaseOrder as (...a: unknown[]) => unknown)(...args),
  updatePurchaseOrderStatus: vi.fn(),
  deletePurchaseOrder: vi.fn(),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", role: "manager" } }),
}));
vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));
vi.mock("@/lib/db/queries/products", () => ({
  getAverageCostPrice: vi.fn(() => Promise.resolve(5200)),
}));

// Regression coverage (final review of the procurement UX branch):
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-use-purchase-orders-receive-price-toast-test-ts-L33
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("usePurchaseOrders handleReceivePO toasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receivePurchaseOrder.mockResolvedValue("received");
  });

  it("never claims a selling price changed on receive, since receiving no longer writes prices", async () => {
    const { usePurchaseOrders } = await import("@/lib/hooks/use-purchase-orders");
    const { result } = renderHook(() => usePurchaseOrders(), { wrapper });

    await act(async () => {
      await result.current.handleReceivePO("po1", [
        { po_item_id: "i1", product_id: "prod1", quantity: 10, current_selling_price: 20 },
      ]);
    });

    expect(toast.success).toHaveBeenCalledWith("Order received and stock updated!");
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining("Selling price"));
  });

  it("confirms the singular batch cost that was typed, and names Avg. Cost as the display figure", async () => {
    const { usePurchaseOrders } = await import("@/lib/hooks/use-purchase-orders");
    const { result } = renderHook(() => usePurchaseOrders(), { wrapper });

    await act(async () => {
      await result.current.handleReceivePO("po1", [
        { po_item_id: "i1", product_id: "prod1", quantity: 10, cost_price: 5000 },
      ]);
    });

    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Cost recorded at"),
      expect.objectContaining({
        description: expect.stringContaining("display figure"),
      }),
    );
  });

  it("does not toast a cost confirmation when no cost override was typed", async () => {
    const { usePurchaseOrders } = await import("@/lib/hooks/use-purchase-orders");
    const { result } = renderHook(() => usePurchaseOrders(), { wrapper });

    await act(async () => {
      await result.current.handleReceivePO("po1", [
        { po_item_id: "i1", product_id: "prod1", quantity: 10 },
      ]);
    });

    expect(toast.success).not.toHaveBeenCalledWith(
      expect.stringContaining("Cost recorded"),
      expect.anything(),
    );
  });

  const receiveWith = async (status: string | undefined) => {
    receivePurchaseOrder.mockResolvedValue(status as never);
    const { usePurchaseOrders } = await import("@/lib/hooks/use-purchase-orders");
    const { result } = renderHook(() => usePurchaseOrders(), { wrapper });
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleReceivePO("po1", [
        { po_item_id: "i1", product_id: "prod1", quantity: 0, current_selling_price: 20 },
      ]);
    });
    return outcome;
  };

  it("says an already-received order changed nothing", async () => {
    expect(await receiveWith("already_received")).toBe(true);
    expect(toast.info).toHaveBeenCalledWith("This order was already received, so nothing changed.");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports a missing order as an error and refreshes the list so the dead order disappears", async () => {
    getPurchaseOrders.mockClear();
    expect(await receiveWith("not_found")).toBe(true);
    expect(getPurchaseOrders).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Couldn't find this order", expect.anything());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says nothing was received when every line is submitted at zero", async () => {
    await receiveWith(undefined);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Nothing was received, the order is unchanged.");
  });
});

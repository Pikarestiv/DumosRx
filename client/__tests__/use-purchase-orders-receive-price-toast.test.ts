import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";
import { toast } from "sonner";

const receivePurchaseOrder = vi.fn(async () => "received");
const getPurchaseOrders = vi.fn(async () => ({ data: [] }));

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
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));
vi.mock("@/lib/db/queries/products", () => ({
  getAverageCostPrice: vi.fn(async () => 5200),
}));

/**
 * Regression coverage (final review of the procurement UX branch): receiving
 * an existing PO writes products.selling_price synchronously, exactly like
 * an Immediate Purchase's create-and-receive - the same "toast when the
 * price change takes place immediately" rule the user asked for applies
 * here too, and previously didn't.
 */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("usePurchaseOrders handleReceivePO selling-price toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    receivePurchaseOrder.mockResolvedValue("received");
  });

  it("toasts a price update when a received line's selling_price differs from the product's current price", async () => {
    const { usePurchaseOrders } = await import("@/lib/hooks/use-purchase-orders");
    const { result } = renderHook(() => usePurchaseOrders(), { wrapper });

    await act(async () => {
      await result.current.handleReceivePO("po1", [
        { po_item_id: "i1", product_id: "prod1", quantity: 10, selling_price: 25, current_selling_price: 20 },
      ]);
    });

    expect(toast.success).toHaveBeenCalledWith("Selling price updated for 1 item");
  });

  it("does not toast a price update when no line has a real override", async () => {
    const { usePurchaseOrders } = await import("@/lib/hooks/use-purchase-orders");
    const { result } = renderHook(() => usePurchaseOrders(), { wrapper });

    await act(async () => {
      await result.current.handleReceivePO("po1", [
        { po_item_id: "i1", product_id: "prod1", quantity: 10, current_selling_price: 20 },
      ]);
    });

    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining("Selling price updated"));
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

  it("does not toast when the submitted selling_price equals the product's current price (no real change)", async () => {
    const { usePurchaseOrders } = await import("@/lib/hooks/use-purchase-orders");
    const { result } = renderHook(() => usePurchaseOrders(), { wrapper });

    await act(async () => {
      await result.current.handleReceivePO("po1", [
        { po_item_id: "i1", product_id: "prod1", quantity: 10, selling_price: 20, current_selling_price: 20 },
      ]);
    });

    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining("Selling price updated"));
  });
});

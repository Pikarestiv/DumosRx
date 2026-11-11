import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePOSPayment } from "@/lib/hooks/use-pos-payment";
import * as posSaleWriter from "@/lib/hooks/pos-sale-writer";
import { toast } from "sonner";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/context/auth-context", () => ({
  getStoredUser: () => ({ id: "cashier-1", name: "Test Cashier" }),
}));

describe("usePOSPayment split-payment transaction failure and recovery", () => {
  const baseCart: CartItem[] = [
    {
      id: "item1",
      name: "Product A",
      generic_name: "",
      strength: "",
      unit_price: 500,
      original_unit_price: 500,
      quantity: 2,
      subtotal: 1000,
      stock: 10,
      cost_price: 300,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves cart, payment splits, and allows retry when writeSaleTransaction fails", async () => {
    const clearCart = vi.fn();
    const refetchProducts = vi.fn();
    const refetchSales = vi.fn();

    const writeSpy = vi
      .spyOn(posSaleWriter, "writeSaleTransaction")
      .mockRejectedValueOnce(new Error("Database locked: simulated write collision"))
      .mockResolvedValueOnce("sale-success-id");

    const { result } = renderHook(() =>
      usePOSPayment({
        cart: baseCart,
        subtotal: 1000,
        tax: 0,
        total: 1000,
        discount: 0,
        selectedCustomer: null,
        setSelectedCustomer: vi.fn(),
        clearCart,
        refetchProducts,
        refetchSales,
      }),
    );

    act(() => {
      result.current.setPaymentMethod("mixed");
      result.current.setPaymentSplits([
        { method: "cash", amount: 400 },
        { method: "transfer", amount: 600, accountId: "bank-1" },
      ]);
      result.current.setAmountPaid("1000");
    });

    expect(result.current.paymentSplits).toHaveLength(2);
    expect(result.current.paymentSplits[0].amount).toBe(400);
    expect(result.current.paymentSplits[1].amount).toBe(600);

    await act(async () => {
      await result.current.handlePayment();
    });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Payment failed — nothing was saved and your cart is intact. Please try again.",
    );
    expect(clearCart).not.toHaveBeenCalled();
    expect(result.current.completedTransaction).toBeNull();
    expect(result.current.processingPayment).toBe(false);

    expect(result.current.paymentSplits).toHaveLength(2);
    expect(result.current.paymentSplits[0].amount).toBe(400);
    expect(result.current.paymentSplits[1].amount).toBe(600);

    await act(async () => {
      await result.current.handlePayment();
    });

    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(clearCart).toHaveBeenCalledTimes(1);
    expect(result.current.completedTransaction).not.toBeNull();
    expect(result.current.completedTransaction?.id).toBe("sale-success-id");
    expect(result.current.completedTransaction?.paymentSplits).toHaveLength(2);
    expect(result.current.processingPayment).toBe(false);
  });
});

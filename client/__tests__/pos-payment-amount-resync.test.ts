import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePOSPayment } from "@/lib/hooks/use-pos-payment";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

describe("usePOSPayment amountPaid & split auto-resynchronization", () => {
  const baseItem: CartItem = {
    id: "item1",
    name: "Product A",
    generic_name: "",
    strength: "",
    unit_price: 350,
    original_unit_price: 350,
    quantity: 2,
    subtotal: 700,
    stock: 10,
    cost_price: 200,
  };

  it("automatically resyncs amountPaid when cart total changes from 700 to 850", () => {
    let currentTotal = 700;
    let currentCart = [baseItem];

    const { result, rerender } = renderHook(
      ({ total, cart }) =>
        usePOSPayment({
          cart,
          subtotal: total,
          tax: 0,
          total,
          discount: 0,
          selectedCustomer: null,
          setSelectedCustomer: vi.fn(),
          clearCart: vi.fn(),
          refetchProducts: vi.fn(),
          refetchSales: vi.fn(),
        }),
      {
        initialProps: { total: currentTotal, cart: currentCart },
      },
    );

    act(() => {
      result.current.setAmountPaid("700");
    });
    expect(result.current.amountPaid).toBe("700");

    currentTotal = 850;
    currentCart = [
      {
        ...baseItem,
        unit_price: 850,
        original_unit_price: 850,
        quantity: 1,
        subtotal: 850,
      },
    ];

    rerender({ total: currentTotal, cart: currentCart });

    expect(result.current.amountPaid).toBe("850");
  });

  it("automatically resyncs a single payment split when cart total changes from 700 to 850", () => {
    let currentTotal = 700;
    let currentCart = [baseItem];

    const { result, rerender } = renderHook(
      ({ total, cart }) =>
        usePOSPayment({
          cart,
          subtotal: total,
          tax: 0,
          total,
          discount: 0,
          selectedCustomer: null,
          setSelectedCustomer: vi.fn(),
          clearCart: vi.fn(),
          refetchProducts: vi.fn(),
          refetchSales: vi.fn(),
        }),
      {
        initialProps: { total: currentTotal, cart: currentCart },
      },
    );

    act(() => {
      result.current.setPaymentSplits([
        { method: "transfer", amount: 700, accountId: "acc-1" },
      ]);
    });
    expect(result.current.paymentSplits[0].amount).toBe(700);

    currentTotal = 850;
    currentCart = [
      {
        ...baseItem,
        unit_price: 850,
        original_unit_price: 850,
        quantity: 1,
        subtotal: 850,
      },
    ];

    rerender({ total: currentTotal, cart: currentCart });

    expect(result.current.paymentSplits[0].amount).toBe(850);
  });

  it("preserves intentionally custom partial amounts when total changes", () => {
    let currentTotal = 700;
    let currentCart = [baseItem];

    const { result, rerender } = renderHook(
      ({ total, cart }) =>
        usePOSPayment({
          cart,
          subtotal: total,
          tax: 0,
          total,
          discount: 0,
          selectedCustomer: null,
          setSelectedCustomer: vi.fn(),
          clearCart: vi.fn(),
          refetchProducts: vi.fn(),
          refetchSales: vi.fn(),
        }),
      {
        initialProps: { total: currentTotal, cart: currentCart },
      },
    );

    act(() => {
      result.current.setAmountPaid("500");
    });
    expect(result.current.amountPaid).toBe("500");

    currentTotal = 850;
    rerender({ total: currentTotal, cart: currentCart });

    expect(result.current.amountPaid).toBe("500");
  });
});

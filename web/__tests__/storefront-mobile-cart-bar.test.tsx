import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { MobileCartBar } from "@/components/storefront/mobile-cart-bar";
import { useCartStore } from "@/lib/store/use-cart-store";

let pathname = "/store/grace";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const fillCart = () =>
  act(() =>
    useCartStore.setState({
      carts: {
        grace: [
          { id: "a", name: "Bulb", price: 1500, quantity: 1 },
          { id: "b", name: "Lamp", price: 3000, quantity: 1 },
        ],
      },
    }),
  );

describe("mobile cart bar", () => {
  beforeEach(() => {
    pathname = "/store/grace";
    act(() => useCartStore.setState({ carts: {} }));
  });
  afterEach(() => vi.restoreAllMocks());

  it("stays out of the way while the cart is empty", () => {
    render(<MobileCartBar storeSlug="grace" currency="NGN" />);

    expect(screen.queryByRole("button", { name: /view cart/i })).toBeNull();
  });

  it("shows the item count and total once the cart has items", () => {
    render(<MobileCartBar storeSlug="grace" currency="NGN" />);
    fillCart();

    const bar = screen.getByRole("button", { name: /view cart/i });
    expect(bar.textContent).toContain("2");
    expect(bar.textContent).toContain("₦4,500");
  });

  it("only counts the cart of its own store", () => {
    render(<MobileCartBar storeSlug="grace" currency="NGN" />);
    act(() => useCartStore.setState({ carts: { other: [{ id: "x", name: "Other", price: 100, quantity: 5 }] } }));

    expect(screen.queryByRole("button", { name: /view cart/i })).toBeNull();
  });

  it("is hidden on the checkout page", () => {
    pathname = "/store/grace/checkout";
    render(<MobileCartBar storeSlug="grace" currency="NGN" />);
    fillCart();

    expect(screen.queryByRole("button", { name: /view cart/i })).toBeNull();
  });

  it("asks the cart sheet to open when tapped", () => {
    const opened = vi.fn();
    window.addEventListener("storefront:open-cart", opened);
    render(<MobileCartBar storeSlug="grace" currency="NGN" />);
    fillCart();

    fireEvent.click(screen.getByRole("button", { name: /view cart/i }));

    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener("storefront:open-cart", opened);
  });
});

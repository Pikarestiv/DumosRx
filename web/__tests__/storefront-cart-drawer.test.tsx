import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { StorefrontCart } from "@/components/storefront/storefront-cart";
import { useCartStore } from "@/lib/store/use-cart-store";

const LONG_NAME = "Alpha Arbutin Brightening Sugar Scrub With Kojic Acid And Shea Butter 500g";

describe("storefront cart drawer", () => {
  beforeEach(() => {
    useCartStore.setState({
      carts: { cutis: [{ id: "p1", name: LONG_NAME, price: 0, quantity: 1 }] },
    });
  });

  function openCart() {
    render(<StorefrontCart storeSlug="cutis" currency="NGN" />);
    fireEvent.click(screen.getByRole("button", { name: /open cart/i }));
    return screen.getByRole("dialog");
  }

  it("keeps the line, the total and the checkout button inside the drawer's side gutters", () => {
    const dialog = openCart();

    const list = within(dialog).getByRole("list", { name: "Cart items" });
    expect(list.parentElement?.className).toMatch(/\bpx-4\b/);
    expect(list.parentElement?.className).toMatch(/\boverflow-y-auto\b/);

    const checkout = within(dialog).getByRole("button", { name: "Proceed to Checkout" });
    const footer = checkout.closest("[data-cart-footer]") as HTMLElement;
    expect(footer.className).toMatch(/\bpx-4\b/);
    expect(footer.className).toContain("env(safe-area-inset-bottom");
    expect(within(footer).getByText("Total")).toBeTruthy();
  });

  it("lets a long product name wrap instead of truncating it", () => {
    const dialog = openCart();

    const name = within(dialog).getByText(LONG_NAME);
    expect(name.className).not.toMatch(/line-clamp-1|truncate/);
    expect(name.className).toContain("break-words");
  });

  it("names the quantity and remove controls for each line", () => {
    const dialog = openCart();

    expect(within(dialog).getByRole("button", { name: `Decrease quantity of ${LONG_NAME}` })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: `Increase quantity of ${LONG_NAME}` })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: `Remove ${LONG_NAME}` }));
    expect(useCartStore.getState().carts.cutis).toEqual([]);
  });
});

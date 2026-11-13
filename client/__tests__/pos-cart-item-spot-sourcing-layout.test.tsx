import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
import { POSCartItem } from "@/components/pos/pos-cart-item";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

function renderItem(overrides: Partial<CartItem>) {
  const item = {
    id: "p1", product_id: "p1", name: "212 Men Perfume", quantity: 1, unit_price: 6000,
    original_unit_price: 6000, subtotal: 6000, stock: 10, ...overrides,
  } as unknown as CartItem;
  render(
    <POSCartItem item={item} isLast updateQuantity={vi.fn()} removeFromCart={vi.fn()} onConfigureSpotSourcing={vi.fn()} />,
  );
}

function expectOneLine(el: HTMLElement) {
  expect(el.className).toContain("whitespace-nowrap");
  expect(el.className).toContain("shrink-0");
}

describe("POS cart item spot-sourcing controls", () => {
  it.each([
    [{ stock: 0 }, "Out of stock"],
    [{ stock: 2, quantity: 5 }, "3 short"],
  ])("renders the out-of-stock action as a one-line 'Source outside' pill with the status beside it (%j)", (overrides, status) => {
    renderItem(overrides);

    const pill = screen.getByRole("button", { name: "Source outside" });
    expectOneLine(pill);
    const statusEl = screen.getByText(status);
    expect(pill.contains(statusEl)).toBe(false);
    expect(statusEl.className).toContain("whitespace-nowrap");
    expect(pill.parentElement?.className).toContain("flex-wrap");
  });

  it.each([
    [{ stock: 10, quantity: 1 }],
    [{ stock: 10, quantity: 9 }],
  ])("offers no 'Source outside' control while the cart holds less than the shelf stock (%j)", (overrides) => {
    renderItem(overrides);

    expect(screen.queryByRole("button", { name: "Source outside" })).toBeNull();
    expect(screen.queryByText("Out of stock")).toBeNull();
  });

  it("offers 'Source outside' with a neutral status once the cart holds all the shelf stock", () => {
    renderItem({ stock: 3, quantity: 3 });

    const pill = screen.getByRole("button", { name: "Source outside" });
    expectOneLine(pill);
    const status = screen.getByText("All shelf stock used");
    expect(pill.contains(status)).toBe(false);
    expect(status.className).toContain("text-muted-foreground");
  });

  it.each([
    [{ stock: 0, quantity: 1 }],
    [{ stock: 2, quantity: 5 }],
    [{ stock: undefined, quantity: 1 }],
  ])("never offers 'Source outside' on a service line (%j)", (overrides) => {
    renderItem({ item_type: "service", ...overrides } as Partial<CartItem>);

    expect(screen.queryByRole("button", { name: "Source outside" })).toBeNull();
  });

  it("shows the spot-sourcing cost as its own unwrapped text beside the 'Spot Sourced' pill, not inside it", () => {
    renderItem({ is_spot_sourced: true, sourcing_cost: 1700 } as Partial<CartItem>);

    const pill = screen.getByRole("button", { name: "Spot Sourced" });
    expectOneLine(pill);
    const cost = screen.getByText(/^Cost .*1,700(\.00)?$/);
    expect(pill.contains(cost)).toBe(false);
    expect(cost.className).toContain("whitespace-nowrap");
    expect(pill.parentElement?.className).toContain("flex-wrap");
  });
});

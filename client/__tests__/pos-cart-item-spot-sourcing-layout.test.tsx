import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { drag: _d, dragConstraints: _c, dragElastic: _e, dragSnapToOrigin: _s, onDragEnd: _o, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
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

  it("keeps the in-stock 'Source outside' link visible without hover and at full-strength muted contrast", () => {
    renderItem({ stock: 10, quantity: 1 });

    const link = screen.getByRole("button", { name: "Source outside" });
    expect(link.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
    expect(link.className).not.toContain("text-muted-foreground/");
    expect(link.className).toContain("text-muted-foreground");
    expect(link.className).toContain("whitespace-nowrap");
    expect(screen.queryByText("Out of stock")).toBeNull();
  });

  it("does not let the 'Spot Sourced' pill wrap mid-label", () => {
    renderItem({ is_spot_sourced: true, sourcing_cost: 1700 } as Partial<CartItem>);

    const pill = screen.getByRole("button", { name: /Spot Sourced/ });
    expect(pill.className).toContain("whitespace-nowrap");
    expect(pill.textContent).toMatch(/Spot Sourced \(.*1,700.*\)/);
  });
});

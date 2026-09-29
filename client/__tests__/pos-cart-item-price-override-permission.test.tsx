import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const {
        drag: _drag,
        dragConstraints: _dragConstraints,
        dragElastic: _dragElastic,
        dragSnapToOrigin: _dragSnapToOrigin,
        onDragEnd: _onDragEnd,
        ...rest
      } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

import { POSCartItem } from "@/components/pos/pos-cart-item";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

const item = {
  id: "p1",
  name: "Cement",
  quantity: 2,
  unit_price: 6000,
  original_unit_price: 5000,
  subtotal: 12000,
} as unknown as CartItem;

function renderItem() {
  render(
    <POSCartItem
      item={item}
      isLast
      updateQuantity={vi.fn()}
      removeFromCart={vi.fn()}
      isResellerSale
      updateUnitPrice={vi.fn()}
    />,
  );
}

/**
 * The reseller / store-markup unit-price field is the app's only
 * "override the price of this line at checkout" surface, so it is what
 * "override_price" gates. An override already on the line (a resumed held
 * sale, a marked-up reseller cart) still renders - read-only - for someone
 * without the permission; only retyping it is gated.
 */
describe("POS cart item price override permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers the editable unit price to a user with override_price", () => {
    renderItem();
    expect(screen.getByLabelText("Override unit price")).toBeTruthy();
  });

  it("hides the editable unit price from a user without override_price", () => {
    hasPermission.mockImplementation((key: string) => key !== "override_price");
    renderItem();
    expect(screen.queryByLabelText("Override unit price")).toBeNull();
  });

  it("still shows the already-overridden price read-only without override_price", () => {
    hasPermission.mockImplementation((key: string) => key !== "override_price");
    renderItem();
    expect(screen.getByText(/6,000/)).toBeTruthy();
  });

  it("checks the override_price key specifically", () => {
    renderItem();
    expect(hasPermission).toHaveBeenCalledWith("override_price");
  });
});

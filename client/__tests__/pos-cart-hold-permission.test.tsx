import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    withRestriction: (fn: unknown) => fn,
    canUseResellerCommission: false,
    canUseMarkupSales: false,
    canUseProformaQuotes: false,
  }),
}));
vi.mock("@/components/pos/pos-cart-item", () => ({
  POSCartItem: () => null,
}));
vi.mock("@/components/pos/pos-redeem-reward", () => ({
  POSRedeemReward: () => null,
}));
vi.mock("@/components/pos/request-item-dialog", () => ({
  RequestItemDialog: () => null,
}));
vi.mock("@/components/pos/proforma-preview-dialog", () => ({
  ProformaPreviewDialog: () => null,
}));

import { POSCart } from "@/components/pos/pos-cart";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

const cart = [
  {
    id: "p1",
    name: "Cement",
    price: 5000,
    quantity: 2,
    stock: 10,
  },
] as unknown as CartItem[];

function renderCart(heldSalesCount = 0) {
  render(
    <POSCart
      cart={cart}
      subtotal={10000}
      tax={0}
      total={10000}
      discount={0}
      calculatedDiscount={0}
      discountType="fixed"
      setDiscount={vi.fn()}
      setDiscountType={vi.fn()}
      vatPercentage={0}
      updateQuantity={vi.fn()}
      removeFromCart={vi.fn()}
      onRequestClearCart={vi.fn()}
      onCheckout={vi.fn()}
      onHoldSale={vi.fn()}
      heldSalesCount={heldSalesCount}
      onOpenHeldSales={vi.fn()}
    />,
  );
}

/**
 * "hold_sales" gates parking a sale, the same way "apply_discounts" gates
 * creating a discount. Seeing that holds exist is deliberately NOT gated -
 * the amber "N on hold" banner stays, so a cashier without the right can
 * still tell a colleague's sale is parked on this till.
 */
describe("POS cart hold permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("offers the Hold Sale action to a user with hold_sales", () => {
    renderCart();
    expect(screen.getByRole("button", { name: /Hold Sale/ })).toBeTruthy();
  });

  it("hides the Hold Sale action from a user without hold_sales", () => {
    hasPermission.mockImplementation((key: string) => key !== "hold_sales");
    renderCart();
    expect(screen.queryByRole("button", { name: /Hold Sale/ })).toBeNull();
  });

  it("still shows that held sales exist to a user without hold_sales", () => {
    hasPermission.mockImplementation((key: string) => key !== "hold_sales");
    renderCart(3);
    expect(screen.getByText("3 on hold")).toBeTruthy();
  });

  it("checks the hold_sales key specifically", () => {
    renderCart();
    expect(hasPermission).toHaveBeenCalledWith("hold_sales");
  });
});

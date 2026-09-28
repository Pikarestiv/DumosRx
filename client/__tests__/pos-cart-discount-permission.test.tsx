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

function renderCart(discount: number) {
  render(
    <POSCart
      cart={cart}
      subtotal={10000}
      tax={0}
      total={10000 - discount}
      discount={discount}
      calculatedDiscount={discount}
      discountType="fixed"
      setDiscount={vi.fn()}
      setDiscountType={vi.fn()}
      vatPercentage={0}
      updateQuantity={vi.fn()}
      removeFromCart={vi.fn()}
      onRequestClearCart={vi.fn()}
      onCheckout={vi.fn()}
    />,
  );
}

/**
 * Item 3 (Cynthia's feedback): "apply_discounts" already existed in the
 * permission catalog with the right role defaults, but nothing in the app
 * ever checked it, so every cashier could discount freely. Seeing a
 * discount that is already on the cart (a resumed held sale, a loyalty
 * redemption) is deliberately NOT gated - only creating or editing one is.
 */
describe("POS cart discount permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(true);
  });

  it("offers the add-discount action to a user with apply_discounts", () => {
    renderCart(0);
    expect(screen.getByRole("button", { name: "+ Add discount" })).toBeTruthy();
  });

  it("hides the add-discount action from a user without apply_discounts", () => {
    hasPermission.mockReturnValue(false);
    renderCart(0);
    expect(screen.queryByRole("button", { name: "+ Add discount" })).toBeNull();
  });

  it("hides the discount editor from a user without apply_discounts even when one is applied", () => {
    hasPermission.mockReturnValue(false);
    renderCart(500);
    expect(screen.queryByRole("button", { name: "Remove discount" })).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("still shows an already-applied discount to a user without apply_discounts", () => {
    hasPermission.mockReturnValue(false);
    renderCart(500);
    expect(screen.getByText("Discount")).toBeTruthy();
  });

  it("checks the apply_discounts key specifically", () => {
    renderCart(0);
    expect(hasPermission).toHaveBeenCalledWith("apply_discounts");
  });
});

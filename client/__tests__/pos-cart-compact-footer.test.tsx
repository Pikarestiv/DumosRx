import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    withRestriction: (fn: unknown) => fn,
    canUseResellerCommission: false,
    canUseMarkupSales: false,
    canUseProformaQuotes: true,
  }),
}));
vi.mock("@/components/pos/pos-cart-item", () => ({ POSCartItem: () => null }));
vi.mock("@/components/pos/pos-redeem-reward", () => ({ POSRedeemReward: () => null }));
vi.mock("@/components/pos/request-item-dialog", () => ({ RequestItemDialog: () => null }));
vi.mock("@/components/pos/proforma-preview-dialog", () => ({ ProformaPreviewDialog: () => null }));

import { POSCart } from "@/components/pos/pos-cart";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

const cart = [{ id: "p1", name: "Cement", price: 5000, quantity: 2, stock: 10 }] as unknown as CartItem[];

function renderCart({ vatPercentage = 0, tax = 0, discount = 0, calculatedDiscount = 0 } = {}) {
  render(
    <POSCart
      cart={cart}
      subtotal={10000}
      tax={tax}
      total={10000 + tax - calculatedDiscount}
      discount={discount}
      calculatedDiscount={calculatedDiscount}
      discountType="fixed"
      setDiscount={vi.fn()}
      setDiscountType={vi.fn()}
      vatPercentage={vatPercentage}
      updateQuantity={vi.fn()}
      removeFromCart={vi.fn()}
      onRequestClearCart={vi.fn()}
      onCheckout={vi.fn()}
      onHoldSale={vi.fn()}
    />,
  );
}

const ACTIONS = [
  ["Request", "Request Item"],
  ["Hold", "Hold Sale"],
  ["Clear", "Clear cart"],
  ["Preview", "Preview Quote"],
] as const;

describe("POS cart footer compaction", () => {
  it.each(ACTIONS)("labels the %s button briefly but names it '%s' for assistive tech", (short, full) => {
    renderCart();

    const button = screen.getByRole("button", { name: full });
    expect(button.textContent?.trim()).toBe(short);
  });

  it("puts all four secondary actions on one row", () => {
    renderCart();

    const rows = new Set(ACTIONS.map(([, full]) => screen.getByRole("button", { name: full }).parentElement));
    expect(rows.size).toBe(1);
  });

  it("hides the VAT row when the store has no VAT rate configured", () => {
    renderCart({ vatPercentage: 0 });

    expect(screen.queryByText(/^VAT/)).toBeNull();
  });

  it("shows the VAT row and amount when a VAT rate is configured", () => {
    renderCart({ vatPercentage: 7.5, tax: 750 });

    expect(screen.getByText("VAT (7.5%)")).toBeTruthy();
    expect(screen.getByText("₦750")).toBeTruthy();
  });

  it("offers '+ Add discount' without a zero amount beside it when there is no discount", () => {
    renderCart();

    expect(screen.getByRole("button", { name: "+ Add discount" })).toBeTruthy();
    expect(screen.queryAllByText("₦0")).toHaveLength(0);
  });

  it("still shows the discount amount once a discount is applied", () => {
    renderCart({ discount: 500, calculatedDiscount: 500 });

    expect(screen.getByText("-₦500")).toBeTruthy();
  });
});

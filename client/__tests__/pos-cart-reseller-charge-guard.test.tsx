import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { POSCart } from "@/components/pos/pos-cart";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    withRestriction: (fn: unknown) => fn,
    canUseResellerCommission: true,
    canUseMarkupSales: true,
    canUseProformaQuotes: true,
  }),
}));
vi.mock("@/components/pos/pos-cart-item", () => ({ POSCartItem: () => null }));
vi.mock("@/components/pos/pos-redeem-reward", () => ({ POSRedeemReward: () => null }));
vi.mock("@/components/pos/request-item-dialog", () => ({ RequestItemDialog: () => null }));
vi.mock("@/components/pos/proforma-preview-dialog", () => ({ ProformaPreviewDialog: () => null }));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: () => true }));

const cart = [
  { id: "p1", name: "Cement", unit_price: 100, original_unit_price: 100, quantity: 1, subtotal: 100, category_name: "Misc" },
];

function renderCart(props: Record<string, unknown>) {
  const onCheckout = vi.fn();
  render(
    <POSCart
      cart={cart as never}
      subtotal={100}
      tax={0}
      total={100}
      discount={0}
      vatPercentage={0}
      currencyCode="NGN"
      updateQuantity={vi.fn()}
      removeFromCart={vi.fn()}
      onRequestClearCart={vi.fn()}
      onCheckout={onCheckout}
      {...props}
    />,
  );
  return onCheckout;
}

describe("POSCart charge guard for reseller sales", () => {
  beforeEach(() => {
    toastError.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("toasts and blocks checkout when a reseller sale has no markup type", () => {
    const onCheckout = renderCart({ isResellerSale: true, markupType: null });
    fireEvent.click(screen.getByRole("button", { name: /Charge/ }));
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(onCheckout).not.toHaveBeenCalled();
  });

  it("proceeds once a markup type is chosen", () => {
    const onCheckout = renderCart({ isResellerSale: true, markupType: "store" });
    fireEvent.click(screen.getByRole("button", { name: /Charge/ }));
    expect(toastError).not.toHaveBeenCalled();
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { PODesktopCreateView } from "@/components/procurement/po-desktop-create-view";
import { POMobileCreateView } from "@/components/procurement/po-mobile-create-view";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";
import type { POProduct } from "@/lib/db/queries/procurement";

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

if (typeof CSS === "undefined" || !CSS.escape) {
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
  };
}

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock("@/components/procurement/owed-settlement-notice", () => ({ OwedSettlementNotice: () => null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({ data: [] }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy" } }),
}));

/**
 * Receiving writes stock irreversibly, so the button has to name the action
 * and the receive has to be confirmed first with a summary of what it does.
 * Which buttons a new order offers depends on its vendor.
 */
describe("new order actions and receive confirmation", () => {
  const product: POProduct = {
    id: "p1",
    name: "Panadol",
    bulk_unit: "Carton",
    base_unit: "Tablet",
    units_per_bulk: 100,
    cost_price: 4,
    stock_quantity: 50,
    selling_price: 12.5,
  };
  const line = (overrides: Partial<POLineItemDraft> = {}): POLineItemDraft => ({
    product_id: "p1",
    product_name: "Panadol",
    bulk_unit: "Carton",
    bulk_quantity: 2,
    units_per_bulk: 100,
    unit_cost: 400,
    subtotal: 800,
    ...overrides,
  });
  const handleReceive = vi.fn();
  const handleSend = vi.fn();
  const handleSaveDraft = vi.fn();

  function baseProps(overrides: Record<string, unknown> = {}) {
    return {
      selectedSupplierName: "Self / Walk-in Purchase",
      paymentStatus: "unpaid",
      dueDate: "",
      amountPaid: "",
      totalAmount: 800,
      products: [product],
      onOpenAddProduct: vi.fn(),
      newlyCreatedProductId: null,
      onNewlyCreatedProductConsumed: vi.fn(),
      canReceive: true,
      isWalkIn: true,
      items: [line()],
      onItemsChange: vi.fn(),
      isSubmitting: false,
      handleReceive,
      handleSend,
      handleSaveDraft,
      setIsEditDetailsOpen: vi.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    handleReceive.mockClear();
    handleSend.mockClear();
    handleSaveDraft.mockClear();
    document.body.innerHTML = "";
  });

  const openReceive = () => {
    act(() => {
      screen.getByRole("button", { name: "Receive stock" }).click();
    });
    return screen.getByRole("alertdialog");
  };

  it("leads a walk-in purchase with Receive stock and offers no Send to vendor", () => {
    render(<PODesktopCreateView {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Receive stock" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send to vendor" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save as Draft" })).toBeTruthy();
  });

  it("offers both Send to vendor and Receive stock for a named vendor", () => {
    render(<PODesktopCreateView {...baseProps({ isWalkIn: false, selectedSupplierName: "Emzor" })} />);
    act(() => {
      screen.getByRole("button", { name: "Send to vendor" }).click();
    });
    expect(handleSend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Receive stock" })).toBeTruthy();
  });

  it("hides Receive stock from a role without receive_purchase_orders", () => {
    render(<PODesktopCreateView {...baseProps({ canReceive: false })} />);
    expect(screen.queryByRole("button", { name: "Receive stock" })).toBeNull();
  });

  it("asks for confirmation before receiving, summarising units, total and that no price changes", () => {
    render(<PODesktopCreateView {...baseProps()} />);
    const dialog = openReceive();

    expect(handleReceive).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("200 units of PANADOL");
    expect(dialog.textContent).not.toContain("1 item");
    expect(dialog.textContent).toContain("₦800");
    expect(dialog.textContent).toContain("No selling price will change.");
  });

  it("receives once the confirmation is accepted", () => {
    render(<PODesktopCreateView {...baseProps()} />);
    openReceive();
    act(() => {
      screen.getByRole("button", { name: "Receive Purchase" }).click();
    });
    expect(handleReceive).toHaveBeenCalledTimes(1);
  });

  it("saves a draft without the receive confirmation", () => {
    render(<PODesktopCreateView {...baseProps()} />);
    act(() => {
      screen.getByRole("button", { name: "Save as Draft" }).click();
    });
    expect(handleSaveDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("labels and gates the mobile receive the same way", () => {
    render(<POMobileCreateView {...baseProps()} />);
    act(() => {
      screen.getByRole("button", { name: "Receive" }).click();
    });
    expect(handleReceive).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("says how many products will sell at or below cost or on a thinner margin", () => {
    render(
      <PODesktopCreateView
        {...baseProps({
          items: [line({ cost_price_override: 13 }), line({ product_id: "p2", product_name: "Amoxil", cost_price_override: 5 })],
          products: [product, { ...product, id: "p2", name: "Amoxil" }],
        })}
      />,
    );
    const dialog = openReceive();
    expect(dialog.textContent).toContain("1 product will sell at or below this cost");
    expect(dialog.textContent).toContain("1 product will earn a thinner margin than before");
  });

  it("warns when receiving an item with zero cost price", () => {
    render(<PODesktopCreateView {...baseProps({ items: [line({ unit_cost: 0, subtotal: 0 })] })} />);
    const dialog = openReceive();

    expect(dialog.textContent).toContain("Price warning on items being received");
    expect(dialog.textContent).toContain("Zero Cost Price (₦0): PANADOL");
    expect(dialog.textContent).toContain("distort your inventory valuation");
    expect(screen.getByRole("button", { name: "Go Back & Edit Prices" })).toBeTruthy();
    act(() => {
      screen.getByRole("button", { name: "Receive with ₦0 Cost" }).click();
    });
    expect(handleReceive).toHaveBeenCalledTimes(1);
  });

  it("warns when the product's own selling price is zero, whatever an old line carried", () => {
    render(
      <PODesktopCreateView
        {...baseProps({ items: [line({ selling_price: 20 })], products: [{ ...product, selling_price: 0 }] })}
      />,
    );
    const dialog = openReceive();

    expect(dialog.textContent).toContain("Zero Selling Price (₦0): PANADOL");
    expect(dialog.textContent).toContain("sold for free (₦0)");
    expect(screen.getByRole("button", { name: "Receive with ₦0 Sell Price" })).toBeTruthy();
  });

  it("warns when both cost price and selling price are zero", () => {
    render(
      <PODesktopCreateView
        {...baseProps({ items: [line({ unit_cost: 0, subtotal: 0 })], products: [{ ...product, selling_price: 0 }] })}
      />,
    );
    const dialog = openReceive();

    expect(dialog.textContent).toContain("Zero Cost Price (₦0): PANADOL");
    expect(dialog.textContent).toContain("Zero Selling Price (₦0): PANADOL");
    expect(screen.getByRole("button", { name: "Receive with ₦0 Cost & Sell Price" })).toBeTruthy();
  });
});

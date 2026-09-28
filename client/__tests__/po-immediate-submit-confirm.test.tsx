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
 * An Immediate Purchase submit writes stock AND rewrites
 * products.selling_price store-wide, irreversibly, but the button said only
 * "Save Purchase Order" / "Save" and nothing on screen said what it was
 * about to do. The label has to name the action, and the submit has to be
 * confirmed first with a summary of what it will change.
 */
describe("Immediate Purchase submit confirmation", () => {
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

  const items: POLineItemDraft[] = [
    {
      product_id: "p1",
      product_name: "Panadol",
      bulk_unit: "Carton",
      bulk_quantity: 2,
      units_per_bulk: 100,
      unit_cost: 400,
      subtotal: 800,
      selling_price: 20,
    },
  ];

  const handleSubmit = vi.fn();

  function baseProps(poType: "standard" | "immediate") {
    return {
      poType,
      setPoType: vi.fn(),
      suppliers: [],
      selectedSupplierId: "__self__",
      setSelectedSupplierId: vi.fn(),
      selectedSupplierName: "Self / Walk-in Purchase",
      notes: "",
      setNotes: vi.fn(),
      paymentStatus: "unpaid",
      setPaymentStatus: vi.fn(),
      dueDate: "",
      setDueDate: vi.fn(),
      amountPaid: "",
      setAmountPaid: vi.fn(),
      totalAmount: 800,
      products: [product],
      onOpenAddProduct: vi.fn(),
      newlyCreatedProductId: null,
      onNewlyCreatedProductConsumed: vi.fn(),
      onOpenAddSupplier: vi.fn(),
      items,
      onItemsChange: vi.fn(),
      isSubmitting: false,
      handleSubmit,
      handleSaveDraft: vi.fn(),
      detailsConfirmed: true,
      onContinue: vi.fn(),
      setIsEditDetailsOpen: vi.fn(),
    };
  }

  beforeEach(() => {
    handleSubmit.mockClear();
    document.body.innerHTML = "";
  });

  it("labels the desktop immediate submit as a receive, not a plain save", () => {
    render(<PODesktopCreateView {...baseProps("immediate")} />);
    expect(
      screen.getByRole("button", { name: "Receive & Save" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save Purchase Order" })).toBeNull();
  });

  it("asks for confirmation before an immediate submit fires, summarising items, total and price changes", () => {
    render(<PODesktopCreateView {...baseProps("immediate")} />);

    act(() => {
      screen.getByRole("button", { name: "Receive & Save" }).click();
    });

    expect(handleSubmit).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("1 item");
    expect(dialog.textContent).toContain("₦800");
    expect(dialog.textContent).toContain("selling price");
  });

  it("submits once the confirmation is accepted", () => {
    render(<PODesktopCreateView {...baseProps("immediate")} />);

    act(() => {
      screen.getByRole("button", { name: "Receive & Save" }).click();
    });
    const confirm = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "Receive Purchase");
    expect(confirm).toBeTruthy();
    act(() => {
      confirm!.click();
    });

    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not gate a Standard order's draft save behind the receive confirmation", () => {
    render(<PODesktopCreateView {...baseProps("standard")} />);

    act(() => {
      screen.getByRole("button", { name: "Save as Draft" }).click();
    });

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("labels and gates the mobile immediate submit the same way", () => {
    render(<POMobileCreateView {...baseProps("immediate")} />);

    const button = screen.getByRole("button", { name: "Receive" });
    act(() => {
      button.click();
    });

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});

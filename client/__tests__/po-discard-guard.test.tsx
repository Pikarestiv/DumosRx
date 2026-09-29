import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { PODesktopCreateView } from "@/components/procurement/po-desktop-create-view";
import { POMobileCreateView } from "@/components/procurement/po-mobile-create-view";
import { PODesktopEditView } from "@/components/procurement/po-desktop-edit-view";
import { POMobileEditView } from "@/components/procurement/po-mobile-edit-view";
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

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({ data: [] }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy" } }),
}));

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
  },
];

function createProps(withItems: boolean) {
  return {
    poType: "immediate" as const,
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
    totalAmount: withItems ? 800 : 0,
    products: [product],
    onOpenAddProduct: vi.fn(),
    newlyCreatedProductId: null,
    onNewlyCreatedProductConsumed: vi.fn(),
    onOpenAddSupplier: vi.fn(),
    items: withItems ? items : [],
    onItemsChange: vi.fn(),
    isSubmitting: false,
    handleSubmit: vi.fn(),
    handleSaveDraft: vi.fn(),
    detailsConfirmed: true,
    onContinue: vi.fn(),
    setIsEditDetailsOpen: vi.fn(),
  };
}

function editProps(withItems: boolean) {
  return {
    poId: "abcdef12-0000",
    selectedSupplierName: "Self / Walk-in Purchase",
    poType: "immediate" as const,
    products: [product],
    items: withItems ? items : [],
    onItemsChange: vi.fn(),
    onOpenAddProduct: vi.fn(),
    newlyCreatedProductId: null,
    onNewlyCreatedProductConsumed: vi.fn(),
    isSubmitting: false,
    handleSubmit: vi.fn(),
    onOpenEditDetails: vi.fn(),
  };
}

/**
 * All four builder views navigated straight back to /procurement on the back
 * button, discarding however many line items had been entered with no
 * warning and no way back.
 */
describe("procurement builder discard guard", () => {
  beforeEach(() => {
    push.mockClear();
  });

  const views: [string, () => React.ReactElement, () => React.ReactElement][] = [
    [
      "desktop create",
      () => <PODesktopCreateView {...createProps(true)} />,
      () => <PODesktopCreateView {...createProps(false)} />,
    ],
    [
      "mobile create",
      () => <POMobileCreateView {...createProps(true)} />,
      () => <POMobileCreateView {...createProps(false)} />,
    ],
    [
      "desktop edit",
      () => <PODesktopEditView {...editProps(true)} />,
      () => <PODesktopEditView {...editProps(false)} />,
    ],
    [
      "mobile edit",
      () => <POMobileEditView {...editProps(true)} />,
      () => <POMobileEditView {...editProps(false)} />,
    ],
  ];

  for (const [name, withItems, withoutItems] of views) {
    it(`${name}: asks before discarding entered items`, () => {
      render(withItems());

      act(() => {
        screen.getByRole("button", { name: "Back" }).click();
      });

      expect(push).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog").textContent).toContain("Discard");

      const discard = screen
        .getAllByRole("button")
        .find((b) => b.textContent === "Discard");
      act(() => {
        discard!.click();
      });
      expect(push).toHaveBeenCalledWith("/procurement");
    });

    it(`${name}: leaves immediately when nothing has been entered`, () => {
      render(withoutItems());

      act(() => {
        screen.getByRole("button", { name: "Back" }).click();
      });

      expect(push).toHaveBeenCalledWith("/procurement");
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  }
});

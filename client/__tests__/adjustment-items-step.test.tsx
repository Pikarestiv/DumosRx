import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AdjustmentItemsStep } from "@/components/stock-batch/adjustment-items-step";
import type { AdjustmentDraftItem } from "@/components/stock-batch/adjustment-items-step";

// Same jsdom stub the PO item-builder combobox tests use: the combobox keeps
// its active option scrolled into view, which jsdom does not implement.
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

if (typeof CSS === "undefined" || !CSS.escape) {
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = {
    escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
  };
}

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

// The step picks a desktop table or a phone card list off this hook, the same
// way POItemBuilder does, so every row assertion below runs against both.
let isTabletUp = true;
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => isTabletUp,
}));

// The item picker is now the shared ProductCombobox (same component and
// interaction model the PO item builder uses), so this step pulls in the
// combobox's store/catalog dependencies.
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { store_type: "pharmacy" } }),
}));
vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({ data: [] }),
}));

// `barcode` doubles as the SKU in this schema - there is no separate column,
// and the cycle-count flow already displays it as the item's SKU.
const products = [
  {
    id: "p1",
    name: "Paracetamol 500mg",
    generic_name: "Paracetamol",
    barcode: "PAR-500",
    stock_quantity: 40,
    cost_price: 25,
  },
  {
    id: "p2",
    name: "Amoxil 250mg",
    generic_name: "Amoxicillin",
    barcode: "250987654321",
    stock_quantity: 12,
    cost_price: 90,
  },
];

function item(over: Partial<AdjustmentDraftItem> = {}): AdjustmentDraftItem {
  return {
    productId: "p1",
    name: "Paracetamol 500mg",
    sku: "PAR-500",
    currentStock: 40,
    quantity: 0,
    unitCost: 25,
    ...over,
  };
}

const onAdd = vi.fn();
const onChangeQuantity = vi.fn();
const onRemove = vi.fn();

function renderStep(items: AdjustmentDraftItem[], reason = "damage") {
  return render(
    <AdjustmentItemsStep
      reason={reason as never}
      items={items}
      products={products as never}
      onAdd={onAdd}
      onChangeQuantity={onChangeQuantity}
      onRemove={onRemove}
    />,
  );
}

describe.each([
  ["desktop table", true],
  ["mobile cards", false],
])("Adjust Stock - items step (%s)", (_label, tabletUp) => {
  beforeEach(() => {
    isTabletUp = tabletUp;
    onAdd.mockReset();
    onChangeQuantity.mockReset();
    onRemove.mockReset();
  });

  it("previews stock after a removal", () => {
    renderStep([item({ currentStock: 40, quantity: 6 })]);
    const row = screen.getByTestId("adjustment-item-p1");
    expect(within(row).getByTestId("current-stock").textContent).toBe("40");
    expect(within(row).getByTestId("stock-after").textContent).toBe("34");
  });

  it("previews stock after an addition", () => {
    renderStep([item({ currentStock: 40, quantity: 6 })], "receive_items");
    const row = screen.getByTestId("adjustment-item-p1");
    expect(within(row).getByTestId("stock-after").textContent).toBe("46");
  });

  it("never previews a negative stock level", () => {
    renderStep([item({ currentStock: 3, quantity: 10 })]);
    expect(
      within(screen.getByTestId("adjustment-item-p1")).getByTestId("stock-after").textContent,
    ).toBe("0");
  });

  it("reports quantity edits and removals to its parent", () => {
    renderStep([item({ quantity: 2 })]);
    const row = screen.getByTestId("adjustment-item-p1");

    fireEvent.change(within(row).getByLabelText(/quantity/i), { target: { value: "7" } });
    expect(onChangeQuantity).toHaveBeenCalledWith("p1", 7);

    fireEvent.click(within(row).getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith("p1");
  });

  it("shows the item's name and SKU", () => {
    renderStep([item()]);
    const row = screen.getByTestId("adjustment-item-p1");
    expect(row.textContent).toContain("Paracetamol 500mg");
    expect(row.textContent).toContain("PAR-500");
  });

  it("prompts to add an item when the list is empty", () => {
    renderStep([]);
    expect(screen.getByText(/no items added yet/i)).toBeTruthy();
    expect(screen.queryByTestId(/^adjustment-item-/)).toBeNull();
  });
});

// Only one of the two branches may ever be mounted: the table and the card
// list each own a per-row quantity input, so CSS-hiding one would double
// every row's inputs and duplicate its accessible names.
describe("Adjust Stock - items step responsive split", () => {
  beforeEach(() => {
    onAdd.mockReset();
    onChangeQuantity.mockReset();
    onRemove.mockReset();
  });

  it("renders the ARIA table with its column headers at tablet width and up", () => {
    isTabletUp = true;
    renderStep([item()]);

    const table = screen.getByRole("table", { name: /items to adjust/i });
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Item", "Current", "Quantity", "Stock After", ""]);
  });

  it("renders cards instead of the table below tablet width", () => {
    isTabletUp = false;
    renderStep([item()]);

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByTestId("adjustment-item-p1")).toBeTruthy();
  });

  it("mounts exactly one quantity input per item on either branch", () => {
    isTabletUp = true;
    const desktop = renderStep([item()]);
    expect(screen.getAllByLabelText(/quantity for paracetamol/i)).toHaveLength(1);
    desktop.unmount();

    isTabletUp = false;
    renderStep([item()]);
    expect(screen.getAllByLabelText(/quantity for paracetamol/i)).toHaveLength(1);
  });
});

describe("Adjust Stock - items step picker", () => {
  beforeEach(() => {
    isTabletUp = true;
    onAdd.mockReset();
    onChangeQuantity.mockReset();
    onRemove.mockReset();
  });

  it("searches through a combobox rather than a bare input", () => {
    renderStep([]);
    const search = screen.getByPlaceholderText(/search by name, sku or barcode/i);
    expect(search.getAttribute("role")).toBe("combobox");
  });

  it("adds a row the moment a catalog match is picked, with no separate Add click", () => {
    renderStep([]);
    const search = screen.getByPlaceholderText(/search by name, sku or barcode/i);

    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "amoxil" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /amoxil/i }));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
  });

  it("finds a product by SKU/barcode or generic name", () => {
    renderStep([]);
    const search = screen.getByPlaceholderText(/search by name, sku or barcode/i);
    fireEvent.focus(search);

    fireEvent.change(search, { target: { value: "PAR-500" } });
    expect(screen.getByRole("option", { name: /paracetamol/i })).toBeTruthy();

    fireEvent.change(search, { target: { value: "amoxicillin" } });
    expect(screen.getByRole("option", { name: /amoxil/i })).toBeTruthy();
  });

  it("hides an already-added product from the search results", () => {
    renderStep([item({ productId: "p1" })]);
    const search = screen.getByPlaceholderText(/search by name, sku or barcode/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "a" } });

    expect(screen.queryByRole("option", { name: /paracetamol/i })).toBeNull();
    expect(screen.getByRole("option", { name: /amoxil/i })).toBeTruthy();
  });

  // An adjustment can only move stock that already exists in the catalog, so
  // the combobox's "create a new product" row is suppressed here.
  it("never offers to create a new product from the picker", () => {
    renderStep([]);
    const search = screen.getByPlaceholderText(/search by name, sku or barcode/i);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "nothing matches this" } });

    expect(screen.queryByText(/as new product/i)).toBeNull();
  });
});

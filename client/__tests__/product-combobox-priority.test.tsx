import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductCombobox, type SelectedProduct } from "@/components/ui/product-combobox";
import {
  getProductStockPriority,
  sortComboboxOptions,
} from "@/components/ui/product-combobox-options";

if (typeof CSS === "undefined" || !CSS.escape) {
  (global as any).CSS = { escape: (s: string) => s };
}

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { store_type: "pharmacy", uppercase_display_enabled: 1 },
  }),
}));

vi.mock("@/lib/hooks/use-product-list", () => ({
  useProductList: () => ({ data: [] }),
}));

describe("product-combobox stock prioritization helpers", () => {
  it("assigns priority 0 for stock owed, 1 for out of stock, 2 for low stock, 3 for normal stock", () => {
    const owedItem: SelectedProduct = {
      name: "Item A",
      source: "local",
      stock_owed: 4,
      stock_quantity: 0,
    };
    const outOfStockItem: SelectedProduct = {
      name: "Item B",
      source: "local",
      stock_quantity: 0,
    };
    const lowStockItem: SelectedProduct = {
      name: "Item C",
      source: "local",
      stock_quantity: 3,
      reorder_level: 5,
    };
    const normalStockItem: SelectedProduct = {
      name: "Item D",
      source: "local",
      stock_quantity: 20,
      reorder_level: 5,
    };

    expect(getProductStockPriority(owedItem)).toBe(0);
    expect(getProductStockPriority(outOfStockItem)).toBe(1);
    expect(getProductStockPriority(lowStockItem)).toBe(2);
    expect(getProductStockPriority(normalStockItem)).toBe(3);
  });

  it("falls back to default threshold (10) when reorder_level is null or undefined", () => {
    const nullReorderLowStock: SelectedProduct = {
      name: "Item E",
      source: "local",
      stock_quantity: 4,
      reorder_level: null,
    };
    const nullReorderInStock: SelectedProduct = {
      name: "Item F",
      source: "local",
      stock_quantity: 15,
      reorder_level: null,
    };

    expect(getProductStockPriority(nullReorderLowStock)).toBe(2);
    expect(getProductStockPriority(nullReorderInStock)).toBe(3);
  });

  it("sorts local items by stock priority: owed first, 0 stock next, then low stock by lowest quantity", () => {
    const items: SelectedProduct[] = [
      { name: "Normal Stock", source: "local", stock_quantity: 100, reorder_level: 10 },
      { name: "Global Item", source: "global" },
      { name: "Low Stock High", source: "local", stock_quantity: 8, reorder_level: 10 },
      { name: "Low Stock Low", source: "local", stock_quantity: 2, reorder_level: 10 },
      { name: "Stock Owed High", source: "local", stock_owed: 5, stock_quantity: 0 },
      { name: "Stock Owed Low", source: "local", stock_owed: 1, stock_quantity: 0 },
      { name: "Out of Stock", source: "local", stock_quantity: 0, reorder_level: 10 },
    ];

    const sorted = sortComboboxOptions(items);

    expect(sorted.map((s) => s.name)).toEqual([
      "Stock Owed High",
      "Stock Owed Low",
      "Out of Stock",
      "Low Stock Low",
      "Low Stock High",
      "Normal Stock",
      "Global Item",
    ]);
  });
});

describe("ProductCombobox UI stock badges and sections", () => {
  const sampleProducts = [
    {
      id: "p1",
      name: "Paracetamol 500mg",
      stock_quantity: 0,
      stock_owed: 5,
      reorder_level: 10,
    },
    {
      id: "p2",
      name: "Amoxicillin 250mg",
      stock_quantity: 0,
      stock_owed: 0,
      reorder_level: 10,
    },
    {
      id: "p3",
      name: "Vitamin C",
      stock_quantity: 2,
      stock_owed: 0,
      reorder_level: 5,
    },
    {
      id: "p4",
      name: "Ibuprofen 400mg",
      stock_quantity: 50,
      stock_owed: 0,
      reorder_level: 10,
    },
  ];

  function renderTestCombobox(value = "") {
    const onChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ProductCombobox
          value={value}
          onChange={onChange}
          products={sampleProducts}
          showGlobalSuggestions={false}
          showCreateNewOption={false}
        />
      </QueryClientProvider>,
    );
    return { onChange };
  }

  it("renders stock status badges and restock section headers when opened", async () => {
    renderTestCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(await screen.findByText("Needs Restocking")).toBeTruthy();
    expect(screen.getByText("All Products")).toBeTruthy();

    expect(screen.getByText("5 owed")).toBeTruthy();
    expect(screen.getByText("0 in stock")).toBeTruthy();
    expect(screen.getByText("Low (2)")).toBeTruthy();
    expect(screen.getByText("50 in stock")).toBeTruthy();
  });

  it("prioritizes owed and out-of-stock items in search results", async () => {
    const { onChange } = renderTestCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const items = await screen.findAllByRole("option");
    expect(items[0].textContent).toContain("Paracetamol 500mg");
    expect(items[1].textContent).toContain("Amoxicillin 250mg");
    expect(items[2].textContent).toContain("Vitamin C");
    expect(items[3].textContent).toContain("Ibuprofen 400mg");

    fireEvent.mouseDown(items[0]);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Paracetamol 500mg",
        stock_owed: 5,
      }),
    );
  });

  it("applies uppercase display class to the input and option labels", async () => {
    renderTestCombobox();
    const input = screen.getByRole("combobox");
    expect(input.className).toContain("uppercase");

    fireEvent.focus(input);
    const items = await screen.findAllByRole("option");
    const nameSpan = items[0].querySelector("span.font-medium");
    expect(nameSpan?.className).toContain("uppercase");
  });
});

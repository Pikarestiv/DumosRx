import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ProductDatabaseFilters } from "@/components/products/product-database-filters";
import { transformProduct, type Product } from "@/components/products/types";
import type { ProductWithDetails } from "@/lib/types/product";

const granted = vi.hoisted(() => ({ keys: new Set<string>() }));
const printer = vi.hoisted(() => ({ jobs: [] as string[] }));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.keys.has(key),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ canManageStockBatch: false }),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN", uppercase_display_enabled: 0 } }),
}));
vi.mock("@/lib/utils/print-node", () => ({
  printNode: (node: HTMLElement) => {
    printer.jobs.push(node.innerHTML);
    return Promise.resolve();
  },
}));

const product = (fields: Partial<ProductWithDetails>): Product =>
  transformProduct({ id: "p1", name: "Paracetamol", selling_price: 1250, cost_price: 900, ...fields } as ProductWithDetails);

function renderFilters(labelProducts?: Product[]) {
  return render(
    <ProductDatabaseFilters
      searchTerm=""
      setSearchTerm={() => {}}
      categoryFilter="all"
      setCategoryFilter={() => {}}
      statusFilter="all"
      setStatusFilter={() => {}}
      categories={["all"]}
      statuses={["all"]}
      onManageCategories={() => {}}
      onProductsChanged={() => {}}
      labelProducts={labelProducts}
    />,
  );
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    { measureText: () => ({ width: 5 }) } as unknown as CanvasRenderingContext2D,
  );
  granted.keys = new Set();
  printer.jobs = [];
  localStorage.clear();
});

describe("ProductDatabaseFilters label printing", () => {
  it("hides Print labels from a user without print_product_labels", () => {
    renderFilters([product({ barcode: "5901234123457" })]);
    expect(screen.queryByRole("button", { name: "Print labels" })).toBeNull();
  });

  it("hides Print labels when no product list is passed in", () => {
    granted.keys = new Set(["print_product_labels"]);
    renderFilters(undefined);
    expect(screen.queryByRole("button", { name: "Print labels" })).toBeNull();
  });

  it("prints each filtered product's selling price on its label", () => {
    granted.keys = new Set(["print_product_labels"]);
    renderFilters([
      product({ barcode: "5901234123457" }),
      product({ id: "p2", name: "Vitamin C", selling_price: 2250, cost_price: 1000 }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Print labels" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /print 2 labels/i }));

    const host = document.createElement("div");
    host.innerHTML = printer.jobs[0];
    const prices = Array.from(host.querySelectorAll(".label .price")).map((p) => p.textContent);
    expect(prices).toEqual([`NGN ${(1250).toLocaleString()}`, `NGN ${(2250).toLocaleString()}`]);
  });
});

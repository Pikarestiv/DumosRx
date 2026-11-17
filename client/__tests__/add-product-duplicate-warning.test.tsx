import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (typeof CSS === "undefined" || !CSS.escape) {
  (globalThis as unknown as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
}

const catalog = vi.hoisted(() => [
  { id: "p1", name: "E45 Lotion", strength: "200ml", barcode: "5000000000011", category_name: "Skin Care" },
]);

vi.mock("@/lib/db/queries/products", () => ({
  getProductList: () => Promise.resolve(catalog),
  getSupplierNames: () => Promise.resolve([]),
}));
vi.mock("@/lib/db/queries/categories", () => ({ getCategoryList: () => Promise.resolve([]) }));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeType: "retail",
    t: (key: string) => (key === "product" ? "Product" : key),
    storeProfile: { currency: "NGN", uppercase_display_enabled: 0, store_type: "retail" },
  }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canUseEcommerce: true,
    getUpgradeMessage: () => "",
    withRestriction: (fn: unknown) => fn,
  }),
}));
vi.mock("@/components/pos/camera-scanner-dialog", () => ({ CameraScannerDialog: () => null }));

import { AddProductDialog } from "@/components/products/add-product-dialog";

function renderDialog(onAddProduct = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AddProductDialog open onOpenChange={() => {}} onAddProduct={onAddProduct} />
    </QueryClientProvider>,
  );
  return onAddProduct;
}

async function typeName(value: string) {
  const input = await screen.findByPlaceholderText(/product name/i);
  fireEvent.change(input, { target: { value } });
}

describe("adding a product that already exists", () => {
  beforeEach(() => vi.clearAllMocks());

  it("warns when the name and strength match an existing product but still allows saving", async () => {
    const onAddProduct = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: /additional details/i }));
    fireEvent.change(screen.getByLabelText("Strength / Size"), { target: { value: "200ml" } });
    await typeName("e45 lotion");

    expect(await screen.findByText(/already exists in Skin Care/)).toBeTruthy();

    fireEvent.change(screen.getByRole("spinbutton", { name: /^Selling Price/ }), { target: { value: "2500" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Reorder Level/ }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add Product$/ }));
    await waitFor(() => expect(onAddProduct).toHaveBeenCalledTimes(1));
  });

  it("stays quiet once a different strength tells the two apart", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: /additional details/i }));
    fireEvent.change(screen.getByLabelText("Strength / Size"), { target: { value: "500ml" } });
    await typeName("E45 Lotion");

    await waitFor(() => expect(screen.queryByText(/already exists/)).toBeNull());
  });

  it("refuses to save a barcode that already belongs to another product", async () => {
    const onAddProduct = renderDialog();
    await typeName("Brand new thing");
    fireEvent.change(screen.getByLabelText(/Barcode/), { target: { value: "5000000000011" } });

    expect(await screen.findByText(/already belongs to/)).toBeTruthy();

    fireEvent.change(screen.getByRole("spinbutton", { name: /^Selling Price/ }), { target: { value: "100" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Reorder Level/ }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add Product$/ }));

    expect(await screen.findByText("Validation Error")).toBeTruthy();
    expect(onAddProduct).not.toHaveBeenCalled();
  });
});

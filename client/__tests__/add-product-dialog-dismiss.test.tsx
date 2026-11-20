import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    matches: false,
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

vi.mock("@/lib/db/queries/products", () => ({
  getProductList: () => Promise.resolve([]),
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

describe("AddProductDialog dismiss controls", () => {
  it("closes when the Cancel button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AddProductDialog open onOpenChange={onOpenChange} onAddProduct={vi.fn()} />
      </QueryClientProvider>,
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    act(() => {
      fireEvent.click(cancelBtn);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes when the X button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AddProductDialog open onOpenChange={onOpenChange} onAddProduct={vi.fn()} />
      </QueryClientProvider>,
    );

    const closeBtn = screen.getByRole("button", { name: "Close" });
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

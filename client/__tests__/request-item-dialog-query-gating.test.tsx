import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * RequestItemDialog is permanently mounted at five call sites (the inventory
 * catalog, the POS cart, the POS product list and two procurement screens),
 * so an ungated query in it meant opening Inventory or POS always paid for a
 * full customer list + product list read for a dialog that is almost never
 * opened. Both reads must wait until the dialog is actually open.
 */

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

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const getAllCustomers = vi.fn(async () => []);
const getProductList = vi.fn(async () => []);

vi.mock("@/lib/db/queries/customers", () => ({
  getAllCustomers: () => getAllCustomers(),
}));

vi.mock("@/lib/db/queries/products", () => ({
  getProductList: () => getProductList(),
}));

vi.mock("@/lib/db/requested-products-queries", () => ({
  logRequestedProduct: vi.fn(async () => {}),
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplay: () => false,
  capitalizeWords: (s: string) => s,
}));

import { RequestItemDialog } from "@/components/pos/request-item-dialog";

function renderDialog(open: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RequestItemDialog open={open} onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("RequestItemDialog data fetching", () => {
  beforeEach(() => {
    getAllCustomers.mockClear();
    getProductList.mockClear();
  });

  it("reads nothing while it is closed", async () => {
    renderDialog(false);
    await new Promise((r) => setTimeout(r, 0));

    expect(getAllCustomers).not.toHaveBeenCalled();
    expect(getProductList).not.toHaveBeenCalled();
  });

  it("reads the customer and product lists once it is opened", async () => {
    renderDialog(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(getAllCustomers).toHaveBeenCalled();
    expect(getProductList).toHaveBeenCalled();
  });
});

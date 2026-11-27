import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const { toastError, plan } = vi.hoisted(() => ({ toastError: vi.fn(), plan: { cap: 2 as number | null } }));

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/lib/db/queries/products", () => ({ getProductList: () => Promise.resolve([]), getSupplierNames: () => Promise.resolve([]) }));
vi.mock("@/lib/db/queries/categories", () => ({ getCategoryList: () => Promise.resolve([]) }));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeType: "retail",
    t: (key: string) => (key === "product" ? "Product" : key),
    storeProfile: { currency: "NGN", uppercase_display_enabled: 0, store_type: "retail", online_store_enabled: 1 },
  }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({
    canUseEcommerce: true,
    storefrontEntitlements: { storefront_enabled: true, max_online_products: plan.cap },
    getUpgradeMessage: () => "",
    withRestriction: (fn: unknown) => fn,
  }),
}));
vi.mock("@/components/pos/camera-scanner-dialog", () => ({ CameraScannerDialog: () => null }));

import { AddProductDialog } from "@/components/products/add-product-dialog";

describe("the Show Online switch on a capped storefront", () => {
  let db: Database;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId("store-1");
  });

  beforeEach(() => {
    toastError.mockReset();
    plan.cap = 2;
    db.run("DELETE FROM products");
  });

  function listed(count: number) {
    for (let i = 0; i < count; i++) {
      db.run(`INSERT INTO products (id, name, selling_price, show_online, store_id, _deleted) VALUES (?, ?, 100, 1, 'store-1', 0)`, [`p${i}`, `p${i}`]);
    }
  }

  async function openNewProduct() {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <AddProductDialog open onOpenChange={() => {}} onAddProduct={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /additional details/i }));
    return screen.getByRole("switch", { name: /show online/i });
  }

  it("starts a new product off and refuses to turn it on once the listing is full", async () => {
    listed(2);
    const toggle = await openNewProduct();

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
    fireEvent.click(toggle);

    expect(toastError).toHaveBeenCalledWith("Your Pro plan lists up to 2 products online. Turn another product off or upgrade to Enterprise.");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("starts a new product listed while there is room", async () => {
    listed(1);
    const toggle = await openNewProduct();

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("leaves an uncapped plan alone", async () => {
    plan.cap = null;
    listed(5);
    const toggle = await openNewProduct();

    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});

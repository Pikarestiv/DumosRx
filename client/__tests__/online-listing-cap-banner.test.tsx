import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";

const { plan } = vi.hoisted(() => ({ plan: { cap: 2 as number | null, online: 1 } }));

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { online_store_enabled: plan.online } }),
}));
vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ storefrontEntitlements: { storefront_enabled: true, max_online_products: plan.cap } }),
}));

import { OnlineListingCapBanner } from "@/components/products/online-listing-cap-banner";

describe("OnlineListingCapBanner", () => {
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
    plan.cap = 2;
    plan.online = 1;
    db.run("DELETE FROM products");
  });

  function listed(count: number) {
    for (let i = 0; i < count; i++) {
      db.run(`INSERT INTO products (id, name, selling_price, show_online, store_id, _deleted) VALUES (?, ?, 100, 1, 'store-1', 0)`, [`p${i}`, `p${i}`]);
    }
  }

  function renderBanner() {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <OnlineListingCapBanner />
      </QueryClientProvider>,
    );
  }

  it("warns when more products are listed than the plan shows", async () => {
    listed(3);
    renderBanner();

    expect((await screen.findByRole("alert")).textContent).toMatch(/3 products are listed online.*up to 2/);
  });

  it("says the slots are used up at the cap", async () => {
    listed(2);
    renderBanner();

    expect((await screen.findByRole("status")).textContent).toMatch(/All 2 online slots/);
  });

  it.each([
    ["with room left", 2, 1, 1],
    ["without a cap", null, 1, 5],
    ["with the storefront off", 2, 0, 5],
  ])("stays out of the way %s", async (_case, cap, online, count) => {
    plan.cap = cap;
    plan.online = online;
    listed(count);
    const { container } = renderBanner();

    await waitFor(() => expect(container.textContent).toBe(""));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

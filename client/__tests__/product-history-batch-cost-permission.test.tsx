import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";

const granted = new Set<string>();

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => granted.has(key),
}));
vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));

const STORE_ID = "store-1";

describe("product History tab and batch cost corrections", () => {
  let db: Database;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
    core.setCurrentUser({ id: "owner-1", first_name: "Cynthia", last_name: "Agidi", role: "store_owner" });
  });

  beforeEach(async () => {
    granted.clear();
    db.run(`DELETE FROM stock_batches; DELETE FROM audit_logs; DELETE FROM _sync_queue;`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, _version, store_id)
       VALUES ('batch-1', 'prod-1', 'LOT-7', 20, 1234, 1, 0, 1, '${STORE_ID}')`,
    );
    const { correctBatchCostPrice } = await import("@/lib/db/queries/batch-cost-correction");
    await correctBatchCostPrice("batch-1", 567);
  });

  function renderHistory() {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <ProductHistoryUnderTest productId="prod-1" />
      </QueryClientProvider>,
    );
  }

  let ProductHistoryUnderTest: typeof import("@/components/products/product-details/product-history").ProductHistory;
  beforeAll(async () => {
    ({ ProductHistory: ProductHistoryUnderTest } = await import(
      "@/components/products/product-details/product-history"
    ));
  });

  it("names the corrected batch but prints no cost to a viewer without view_cost_fields", async () => {
    granted.add("view_activity_log");
    renderHistory();

    expect(await screen.findByText(/Batch #LOT-7/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/1,?234|567/);
  });

  it("shows the old and new cost to a viewer with view_cost_fields", async () => {
    granted.add("view_activity_log");
    granted.add("view_cost_fields");
    renderHistory();

    expect(await screen.findByText(/Batch #LOT-7: cost price 1,234 → 567\./)).toBeTruthy();
  });
});

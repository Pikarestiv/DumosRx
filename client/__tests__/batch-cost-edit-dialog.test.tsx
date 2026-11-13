import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { StockBatch } from "@/lib/types/stock-batch";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const STORE_ID = "store-1";

const batch: StockBatch = {
  id: "batch-1",
  product_id: "prod-1",
  batch_number: "LOT-7",
  quantity: 20,
  cost_price: 1200,
  is_active: 1,
};

describe("BatchCostEditDialog", () => {
  let db: Database;
  let BatchCostEditDialog: typeof import("@/components/products/product-details/batch-cost-edit-dialog").BatchCostEditDialog;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ BatchCostEditDialog } = await import("@/components/products/product-details/batch-cost-edit-dialog"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.run(`DELETE FROM stock_batches; DELETE FROM products; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('prod-1', 'Amoxil 500mg', 0, '${STORE_ID}')`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, store_id)
       VALUES ('batch-1', 'prod-1', 'LOT-7', 20, 1200, 1, 0, '${STORE_ID}')`,
    );
  });

  const storedCost = () => db.exec(`SELECT cost_price FROM stock_batches WHERE id = 'batch-1'`)[0].values[0][0];

  function renderDialog(onOpenChange = vi.fn()) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <BatchCostEditDialog
          batch={batch}
          open
          onOpenChange={onOpenChange}
          currencyCode="NGN"
          canSeeQuantities
          formatPrice={(n) => `₦${n.toLocaleString()}`}
        />
      </QueryClientProvider>,
    );
    return onOpenChange;
  }

  const costInput = () => screen.getByLabelText(/new cost price/i);
  const review = () => screen.getByRole("button", { name: /review change/i });

  it("saves the corrected cost only after the owner confirms it", async () => {
    const onOpenChange = renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.click(review());

    expect(screen.getByText(/past sales keep the cost they were sold at/i)).toBeTruthy();
    expect(screen.getByText(/₦1,200/)).toBeTruthy();
    expect(storedCost()).toBe(1200);

    fireEvent.click(screen.getByRole("button", { name: /confirm change/i }));

    await waitFor(() => expect(storedCost()).toBe(120));
    expect(toast.success).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    ["a negative number", "-5"],
    ["an empty field", ""],
    ["text", "abc"],
    ["an absurdly large figure", "5000000000"],
  ])("will not review %s", (_label, value) => {
    renderDialog();

    fireEvent.change(costInput(), { target: { value } });

    expect((review() as HTMLButtonElement).disabled).toBe(true);
  });

  it("will not review an unchanged cost", () => {
    renderDialog();

    expect((costInput() as HTMLInputElement).value).toBe("1200");
    expect((review() as HTMLButtonElement).disabled).toBe(true);
  });

  it("returns to the input from the confirm step without saving", () => {
    renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.click(review());
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect((costInput() as HTMLInputElement).value).toBe("120");
    expect(storedCost()).toBe(1200);
  });

  it("reports a failed save and keeps the dialog open", async () => {
    db.run(`UPDATE stock_batches SET _deleted = 1 WHERE id = 'batch-1'`);
    const onOpenChange = renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.click(review());
    fireEvent.click(screen.getByRole("button", { name: /confirm change/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

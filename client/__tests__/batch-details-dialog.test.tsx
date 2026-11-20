import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { StockBatch } from "@/lib/types/stock-batch";

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const STORE_ID = "store-1";
const batch = {
  id: "batch-1", product_id: "prod-1", batch_number: "LOT-7", expiry_date: "2027-03-01",
  manufacture_date: "2026-01-15", quantity: 20, cost_price: 1200, is_active: 1,
} as StockBatch;

describe("BatchDetailsDialog", () => {
  let db: Database;
  let BatchDetailsDialog: typeof import("@/components/products/batch-details/batch-details-dialog").BatchDetailsDialog;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ BatchDetailsDialog } = await import("@/components/products/batch-details/batch-details-dialog"));
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
      `INSERT INTO stock_batches (id, product_id, batch_number, expiry_date, manufacture_date, quantity, cost_price, is_active, _deleted, store_id)
       VALUES ('batch-1', 'prod-1', 'LOT-7', '2027-03-01', '2026-01-15', 20, 1200, 1, 0, '${STORE_ID}')`,
    );
  });

  const stored = () => db.exec(`SELECT batch_number, expiry_date FROM stock_batches WHERE id = 'batch-1'`)[0].values[0];

  function renderDialog(onClose = vi.fn()) {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } } })}>
        <BatchDetailsDialog batch={batch} productName="Amoxil 500mg" onClose={onClose} />
      </QueryClientProvider>,
    );
    return onClose;
  }

  const save = () => screen.getByRole("button", { name: "Save details" }) as HTMLButtonElement;
  const lot = () => screen.getByLabelText("Lot number") as HTMLInputElement;
  const expiry = () => screen.getByLabelText("Expiry date") as HTMLInputElement;

  it("opens with the batch's current details and nothing to save yet", () => {
    renderDialog();

    expect(lot().value).toBe("LOT-7");
    expect(expiry().value).toBe("01/03/2027");
    expect(save().disabled).toBe(true);
  });

  it("saves a corrected lot number and closes", async () => {
    const onClose = renderDialog();

    fireEvent.change(lot(), { target: { value: "LOT-8" } });
    fireEvent.click(save());

    await waitFor(() => expect(stored()[0]).toBe("LOT-8"));
    expect(toast.success).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("saves a corrected expiry typed in DD/MM/YYYY", async () => {
    renderDialog();

    fireEvent.change(expiry(), { target: { value: "30/06/2027" } });
    fireEvent.click(save());

    await waitFor(() => expect(stored()[1]).toBe("2027-06-30"));
  });

  it("clears the expiry when the field is emptied", async () => {
    renderDialog();

    fireEvent.change(expiry(), { target: { value: "" } });
    fireEvent.click(save());

    await waitFor(() => expect(stored()[1]).toBeNull());
  });

  it("accepts a lot number of exactly the longest allowed length", () => {
    renderDialog();

    fireEvent.change(lot(), { target: { value: "x".repeat(50) } });
    expect(save().disabled).toBe(false);
  });

  it("closes without saving on cancel", () => {
    const onClose = renderDialog();

    fireEvent.change(lot(), { target: { value: "LOT-8" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(stored()[0]).toBe("LOT-7");
  });

  it("reports a failed save and stays open", async () => {
    db.run(`UPDATE stock_batches SET _deleted = 1 WHERE id = 'batch-1'`);
    const onClose = renderDialog();

    fireEvent.change(lot(), { target: { value: "LOT-8" } });
    fireEvent.click(save());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This batch no longer exists."));
    expect(onClose).not.toHaveBeenCalled();
  });
});

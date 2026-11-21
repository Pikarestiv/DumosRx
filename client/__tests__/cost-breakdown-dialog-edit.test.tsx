import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { StockBatch } from "@/lib/types/stock-batch";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { uppercase_display_enabled: 0 } }) }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const STORE_ID = "store-1";

const batch: StockBatch = {
  id: "batch-1",
  product_id: "prod-1",
  batch_number: "LOT-7",
  expiry_date: "2027-03-01",
  manufacture_date: "2026-01-15",
  quantity: 20,
  cost_price: 1200,
  is_active: 1,
};

describe("cost breakdown dialog, editing one batch", () => {
  let db: Database;
  let CostBreakdownDialog: typeof import("@/components/products/batch-cost/cost-breakdown-dialog").CostBreakdownDialog;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ CostBreakdownDialog } = await import("@/components/products/batch-cost/cost-breakdown-dialog"));
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

  const storedCost = () => db.exec(`SELECT cost_price FROM stock_batches WHERE id = 'batch-1'`)[0].values[0][0];
  const storedDetails = () => db.exec(`SELECT batch_number, expiry_date, manufacture_date FROM stock_batches WHERE id = 'batch-1'`)[0].values[0];

  function renderDialog(onOpenChange = vi.fn(), extra: Partial<React.ComponentProps<typeof CostBreakdownDialog>> = {}) {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <CostBreakdownDialog
          open
          onOpenChange={onOpenChange}
          productName="Amoxil 500mg"
          batches={[batch]}
          initialEditBatchId={batch.id}
          formatPrice={(n: number) => `₦${n.toLocaleString()}`}
          {...extra}
        />
      </QueryClientProvider>,
    );
    return onOpenChange;
  }

  const costInput = () => screen.getByLabelText(/new cost price/i);
  const save = () => screen.getByRole("button", { name: /save changes/i });

  it("saves the corrected cost in one step and previews it first", async () => {
    const onOpenChange = renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });

    expect(screen.getByLabelText(/what changes/i).textContent).toMatch(/Stock value₦24,000 → ₦2,400/);
    expect(screen.getByText(/keep the cost they were sold at/i)).toBeTruthy();
    expect(storedCost()).toBe(1200);

    fireEvent.click(save());

    await waitFor(() => expect(storedCost()).toBe(120));
    expect(toast.success).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("records the reason picked from the dropdown on the audit log", async () => {
    window.HTMLElement.prototype.hasPointerCapture ??= () => false;
    window.HTMLElement.prototype.releasePointerCapture ??= () => {};
    window.HTMLElement.prototype.scrollIntoView ??= () => {};
    renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Reason" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Supplier invoice corrected" }));
    fireEvent.click(save());

    await waitFor(() => expect(storedCost()).toBe(120));
    const [details] = db.exec(`SELECT details FROM audit_logs WHERE record_id = 'batch-1'`)[0].values[0];
    expect(JSON.parse(String(details))).toMatchObject({ reason: "supplier_invoice_corrected", previous_cost_price: 1200 });
  });

  it.each([
    ["a negative number", "-5"],
    ["an empty field", ""],
    ["text", "abc"],
    ["an absurdly large figure", "5000000000"],
  ])("will not save %s", (_label, value) => {
    renderDialog();

    fireEvent.change(costInput(), { target: { value } });

    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });

  it("will not save an unchanged cost", () => {
    renderDialog();

    expect((costInput() as HTMLInputElement).value).toBe("1200");
    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes without saving on cancel", () => {
    const onOpenChange = renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(storedCost()).toBe(1200);
  });

  it("reports a failed save and keeps the dialog open", async () => {
    db.run(`UPDATE stock_batches SET _deleted = 1 WHERE id = 'batch-1'`);
    const onOpenChange = renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.click(save());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  const lot = () => screen.getByLabelText("Lot number") as HTMLInputElement;
  const expiry = () => screen.getByLabelText("Expiry date") as HTMLInputElement;

  it("opens with the batch's cost and its lot, expiry and manufacture date in one form", () => {
    renderDialog();

    expect(costInput()).toBeTruthy();
    expect(lot().value).toBe("LOT-7");
    expect(expiry().value).toBe("01/03/2027");
    expect((screen.getByLabelText("Manufacture date") as HTMLInputElement).value).toBe("15/01/2026");
  });

  it("saves a corrected expiry and lot from the same form, leaving the cost alone", async () => {
    const onOpenChange = renderDialog();

    fireEvent.change(lot(), { target: { value: "LOT-8" } });
    fireEvent.change(expiry(), { target: { value: "30/06/2027" } });
    fireEvent.click(save());

    await waitFor(() => expect(storedDetails().slice(0, 2)).toEqual(["LOT-8", "2027-06-30"]));
    expect(storedCost()).toBe(1200);
    expect(db.exec(`SELECT COUNT(*) FROM audit_logs WHERE action = 'BATCH_COST_CORRECTED'`)[0].values[0][0]).toBe(0);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves a cost change and a details change together, as two audit entries", async () => {
    renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.change(expiry(), { target: { value: "30/06/2027" } });
    fireEvent.click(save());

    await waitFor(() => expect(storedCost()).toBe(120));
    expect(storedDetails()[1]).toBe("2027-06-30");
    const actions = db.exec(`SELECT action FROM audit_logs WHERE record_id = 'batch-1' ORDER BY action`)[0].values.map((row) => row[0]);
    expect(actions).toEqual(["BATCH_COST_CORRECTED", "BATCH_DETAILS_CORRECTED"]);
  });

  it("clears the expiry when the field is emptied", async () => {
    renderDialog();

    fireEvent.change(expiry(), { target: { value: "" } });
    fireEvent.click(save());

    await waitFor(() => expect(storedDetails()[1]).toBeNull());
  });

  it("only asks for a reason once the cost itself is being changed", () => {
    renderDialog();
    expect(screen.queryByRole("combobox", { name: "Reason" })).toBeNull();

    fireEvent.change(costInput(), { target: { value: "120" } });
    expect(screen.getByRole("combobox", { name: "Reason" })).toBeTruthy();
  });

  it("lets a user who cannot view costs fix the details without ever seeing a cost", async () => {
    renderDialog(vi.fn(), { canViewCost: false });

    expect(screen.queryByLabelText(/new cost price/i)).toBeNull();
    expect(screen.queryByText("Cost")).toBeNull();
    expect(document.body.textContent).not.toContain("1,200");
    expect(screen.getByRole("heading", { name: "Batch details" })).toBeTruthy();

    fireEvent.change(lot(), { target: { value: "LOT-8" } });
    fireEvent.click(save());

    await waitFor(() => expect(storedDetails()[0]).toBe("LOT-8"));
    expect(storedCost()).toBe(1200);
  });

  it("will not save a manufacture date after the expiry, and says why", () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText("Manufacture date"), { target: { value: "01/04/2027" } });

    expect(screen.getByRole("alert").textContent).toMatch(/before the expiry/i);
    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });

  it("says which half was saved when the cost fails after the details went through", async () => {
    vi.spyOn(await import("@/lib/db/queries/batch-cost-correction"), "correctBatchCostPrice").mockRejectedValueOnce(new Error("boom"));
    renderDialog();

    fireEvent.change(costInput(), { target: { value: "120" } });
    fireEvent.change(lot(), { target: { value: "LOT-8" } });
    fireEvent.click(save());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The batch details were saved, but the cost price was not: boom"));
    expect(storedDetails()[0]).toBe("LOT-8");
    expect(storedCost()).toBe(1200);
  });
});

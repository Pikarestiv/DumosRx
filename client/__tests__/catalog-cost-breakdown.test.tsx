import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import type { Product } from "@/components/products/types";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "capitalize",
  useUppercaseDisplay: () => false,
  capitalizeWords: (s: string) => s,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const STORE_ID = "store-1";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const naira = (n: number) => `₦${n.toLocaleString()}`;

const product = {
  id: "p1", name: "Amoxil 500mg", category: "Antibiotics", costPrice: 670, lastBoughtPrice: 800,
  sellingPrice: 800, stockQuantity: 15, reorderLevel: 5, baseUnit: "unit",
} as Product;

describe("catalog cost breakdown popover", () => {
  let db: Database;
  let CatalogCostCell: typeof import("@/components/products/batch-cost/catalog-cost-cell").CatalogCostCell;
  const originalMatchMedia = window.matchMedia;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ CatalogCostCell } = await import("@/components/products/batch-cost/catalog-cost-cell"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
    core.setCurrentUser({ id: "owner-1", first_name: "Ada", last_name: "Obi", role: "store_owner" });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = ((query: string) => ({
      matches: query.includes("min-width"), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    db.run(`DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
            DELETE FROM audit_logs; DELETE FROM _sync_queue;`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, expiry_date, is_active, _deleted, store_id, created_at) VALUES
        ('bulk', 'p1', 'LOT-A', 13, 650, '${day(300)}', 1, 0, '${STORE_ID}', '2026-03-01T09:30:00.000Z'),
        ('near', 'p1', 'LOT-B', 2, 800, '${day(20)}', 1, 0, '${STORE_ID}', '2026-05-01T10:00:00.000Z'),
        ('gone', 'p1', 'LOT-C', 0, 700, '${day(100)}', 1, 0, '${STORE_ID}', '2026-01-01T08:00:00.000Z')`,
    );
    db.run(`INSERT INTO purchase_orders (id, store_id, total_amount, amount_paid) VALUES ('ab12cd34-0000-4000-8000-000000000001', '${STORE_ID}', 8450, 8450)`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal)
            VALUES ('poi-1', 'ab12cd34-0000-4000-8000-000000000001', 'p1', 13, 1, 650, 8450)`);
    db.run(`INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, unit_cost, total_cost, reference_id, reference_type, _deleted)
            VALUES ('mv-1', 'p1', 'bulk', 'purchase', 13, 650, 8450, 'ab12cd34-0000-4000-8000-000000000001', 'purchase_order', 0)`);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function open(canEditCost: boolean, onChangeSellingPrice = vi.fn()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CatalogCostCell product={product} canEditCost={canEditCost} canSeeQuantities formatCurrency={naira} onChangeSellingPrice={onChangeSellingPrice} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /show cost breakdown/i }));
    return onChangeSellingPrice;
  }

  const rowFor = async (lot: string) => (await screen.findByText(new RegExp(`Lot ${lot}`))).closest("li") as HTMLElement;

  it("lists the batches by receipt and source, marks the one that sells first, and explains the average", async () => {
    open(false);

    const bulk = await rowFor("LOT-A");
    expect(bulk.textContent).toMatch(/Received 01\/03\/2026 \d{2}:30 · From PO-AB12CD34/);
    expect(bulk.textContent).toContain("13 left");
    expect(bulk.textContent).not.toContain("Sells first");
    expect((await rowFor("LOT-B")).textContent).toContain("Sells first");
    expect(document.body.textContent).toContain("Average ₦670 = (13 × ₦650 + 2 × ₦800) / 15 units");
    expect(document.body.textContent).toMatch(/Last received: ₦800 \(01\/05\/2026 \d{2}:00\)/);
  });

  it("is a read-only breakdown without edit_product_cost", async () => {
    open(false);

    await rowFor("LOT-A");
    expect(screen.queryByRole("button", { name: /edit cost of lot/i })).toBeNull();
  });

  it("hides sold-out batches behind a toggle and keeps them editable", async () => {
    open(true);

    await rowFor("LOT-A");
    expect(screen.queryByText(/Lot LOT-C/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 sold-out batch" }));

    const gone = await rowFor("LOT-C");
    expect(gone.textContent).toContain("Sold out");
    expect(within(gone).getByRole("button", { name: /edit cost of lot LOT-C/i })).toBeTruthy();
  });

  it("warns about the batch that sells first, previews the change and saves it with its reason in one step", async () => {
    open(true);

    fireEvent.click(within(await rowFor("LOT-A")).getByRole("button", { name: /edit cost of lot/i }));
    expect(document.body.textContent).toContain("Batch LOT-B (2 units at ₦800) will sell before this one.");
    expect(document.body.textContent).toContain("at or above the selling price");

    fireEvent.change(screen.getByLabelText(/new cost price/i), { target: { value: "6500" } });
    expect(document.body.textContent).toMatch(/far from this product's other batches \(about ₦750\)/);
    fireEvent.change(screen.getByLabelText(/new cost price/i), { target: { value: "600" } });
    expect(screen.getByLabelText(/what changes/i).textContent).toMatch(
      /This batch₦650 → ₦600Average cost₦670 → ₦626.67Stock value₦10,050 → ₦9,400Profit per unit at ₦800₦150 → ₦200/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Typo at receiving" }));
    fireEvent.click(screen.getByRole("button", { name: /save cost/i }));

    await waitFor(() => expect(db.exec(`SELECT cost_price FROM stock_batches WHERE id = 'bulk'`)[0].values[0][0]).toBe(600));
    const [details] = db.exec(`SELECT details FROM audit_logs WHERE record_id = 'bulk'`)[0].values[0];
    expect(JSON.parse(String(details))).toMatchObject({ reason: "typo_at_receiving", previous_cost_price: 650 });
    expect(db.exec(`SELECT unit_cost FROM stock_movements WHERE id = 'mv-1'`)[0].values[0][0]).toBe(650);
    expect(db.exec(`SELECT unit_cost FROM purchase_order_items WHERE id = 'poi-1'`)[0].values[0][0]).toBe(650);
    expect(await rowFor("LOT-A")).toBeTruthy();
  });

  it("hands off to the product edit flow from the margin line", async () => {
    const onChangeSellingPrice = open(true);

    fireEvent.click(within(await rowFor("LOT-A")).getByRole("button", { name: /edit cost of lot/i }));
    fireEvent.change(screen.getByLabelText(/new cost price/i), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: /change selling price/i }));

    expect(onChangeSellingPrice).toHaveBeenCalledWith(product);
  });
  it("opens from the catalog row without selecting the row, and typing in it does not either", async () => {
    const { CatalogRow } = await import("@/components/products/catalog-row");
    const onSelect = vi.fn();
    const noop = () => {};
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <CatalogRow
          product={product} isSelected={false} isDesktop capsClass="capitalize" categoryOptions={["Antibiotics"]}
          canEdit showCostColumn canEditCost canEditSellingPrice canAdjustStockQuantity showStockQuantity
          hasTouchCapability={false} canPrintLabels canDeleteProducts formatCurrency={naira}
          onSelect={onSelect} onSaveCategory={noop} onSaveSellingPrice={noop} onSaveStockQuantity={noop}
          onSaveReorderLevel={noop} onPrintLabel={noop} onDeleteProduct={noop} onEditProduct={noop}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /show cost breakdown/i }));
    fireEvent.click(within(await rowFor("LOT-A")).getByRole("button", { name: /edit cost of lot/i }));
    fireEvent.keyDown(screen.getByLabelText(/new cost price/i), { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
  });
});

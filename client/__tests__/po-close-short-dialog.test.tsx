import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { currency: "NGN" } }) }));

describe("the close-short confirmation", () => {
  let db: Database;
  let POCloseShortDialog: typeof import("@/components/procurement/po-close-short-dialog").POCloseShortDialog;

  beforeAll(async () => {
    ({ POCloseShortDialog } = await import("@/components/procurement/po-close-short-dialog"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted)
            VALUES ('l1', 'po1', 'p1', 10, 4, 10, 500, 5000, 0)`);
  });

  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const open = (queryClient = client()) =>
    render(
      <QueryClientProvider client={queryClient}>
        <POCloseShortDialog orderId="po1" open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

  it("says by how much the order was overpaid once it bills only what arrived", async () => {
    db.run(`INSERT INTO purchase_orders (id, status, total_amount, amount_paid, payment_status, _deleted) VALUES ('po1', 'partially_received', 5000, 5000, 'paid', 0)`);
    open();
    expect((await screen.findByText(/Overpaid by/)).textContent).toMatch(/Overpaid by ₦3,000/);
  });

  it("says nothing about overpayment when what was paid is within what arrived", async () => {
    db.run(`INSERT INTO purchase_orders (id, status, total_amount, amount_paid, payment_status, _deleted) VALUES ('po1', 'partially_received', 5000, 1000, 'partial', 0)`);
    const queryClient = client();
    open(queryClient);
    await waitFor(() => expect(queryClient.getQueryData(["purchase_order_close_short_preview", "po1"])).toBeTruthy());
    expect(screen.queryByText(/Overpaid by/)).toBeNull();
  });
});

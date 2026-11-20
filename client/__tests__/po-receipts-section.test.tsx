import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn((_k: string | string[], _m?: string) => true) }));
vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: (k: string | string[], m?: string) => hasPermission(k, m) }));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({ useDisplayName: () => (s: string) => s }));

describe("receipts on an order", () => {
  let db: Database;
  let POReceiptsSection: typeof import("@/components/procurement/po-receipts-section").POReceiptsSection;
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    ({ POReceiptsSection } = await import("@/components/procurement/po-receipts-section"));
    db = await createProcurementTestDb();
  });

  beforeEach(async () => {
    clearProcurementTables(db);
    hasPermission.mockImplementation(() => true);
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10)`);
    db.run(`INSERT INTO purchase_orders (id, supplier_id, status, type, total_amount, _deleted) VALUES ('po1', 's1', 'sent', 'immediate', 1000, 0)`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted) VALUES ('l1', 'po1', 'p1', 4, 0, 10, 100, 400, 0)`);
    const { receivePurchaseOrder } = await import("@/lib/db/procurement-receiving");
    await receivePurchaseOrder("po1", [{ po_item_id: "l1", quantity: 4 }]);
  });

  const renderSection = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <POReceiptsSection orderId="po1" status="received" />
      </QueryClientProvider>,
    );

  it("voids a receipt only after confirming what will change", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Void receipt" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("40 units of Panadol come back out of stock");
    expect(rows("SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'purchase_order_reversal'")[0][0]).toBe(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Void receipt" }).at(-1) as HTMLElement);

    await waitFor(() => expect(rows("SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'purchase_order_reversal'")[0][0]).toBe(1));
    expect(rows("SELECT status FROM purchase_orders")[0][0]).toBe("sent");
  });

  it("explains why a partly sold receipt cannot be voided", async () => {
    db.run("UPDATE stock_batches SET quantity = 10");
    renderSection();
    expect(await screen.findByText(/has been sold or adjusted since/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Void receipt" })).toBeNull();
  });

  it("needs both receive and stock-adjustment permission", async () => {
    hasPermission.mockImplementation(() => false);
    renderSection();
    expect(await screen.findByText(/40 units/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Void receipt" })).toBeNull();
    expect(hasPermission).toHaveBeenCalledWith(["receive_purchase_orders", "adjust_stock_counts"], "all");
  });
});

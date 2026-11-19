import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

const { push, replace, shareOrDownload, hasPermission } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  shareOrDownload: vi.fn(() => Promise.resolve("shared")),
  hasPermission: vi.fn((_key: string) => true),
}));

vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));
vi.mock("@/lib/hooks/use-permissions", () => ({ useHasPermission: (key: string) => hasPermission(key) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: { name: "Store", currency: "NGN" } }) }));
vi.mock("@/lib/hooks/use-outstanding-backorders", () => ({ useOutstandingBackorders: () => [] }));
vi.mock("@/components/procurement/owed-settlement-notice", () => ({ OwedSettlementNotice: () => null }));
vi.mock("@/lib/utils/share-file", () => ({ shareOrDownload }));
vi.mock("@/components/products/add-product-dialog", () => ({ AddProductDialog: () => null }));
vi.mock("@/components/suppliers/add-supplier-dialog", () => ({ AddSupplierDialog: () => null }));
vi.mock("@react-pdf/renderer", () => ({
  pdf: () => ({ toBlob: () => Promise.resolve(new Blob(["%PDF"])) }),
  Document: () => null, Page: () => null, Text: () => null, View: () => null,
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/lib/hooks/use-procurement-data", () => ({
  useProcurementData: () => ({
    suppliers: [{ id: "s1", name: "Emzor" }],
    products: [{ id: "p1", name: "Panadol", bulk_unit: "Carton", base_unit: "Tablet", units_per_bulk: 10, cost_price: 10, stock_quantity: 0, selling_price: 25 }],
    refetch: vi.fn(),
  }),
}));

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("1024"), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = () => {};

describe("purchase order screen", () => {
  let db: Database;
  let PoOrderScreen: typeof import("@/components/procurement/order-screen/po-order-screen").PoOrderScreen;
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    ({ PoOrderScreen } = await import("@/components/procurement/order-screen/po-order-screen"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue; DELETE FROM _sync_conflicts;");
    push.mockClear();
    shareOrDownload.mockClear();
    hasPermission.mockImplementation(() => true);
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10, 25)`);
  });

  const seedDraft = (supplierId: string | null, quantity = 3) => {
    db.run(`INSERT INTO purchase_orders (id, supplier_id, status, type, total_amount, created_at, _deleted) VALUES ('po1', ?, 'pending', 'immediate', ?, '2026-11-18T08:00:00Z', 0)`, [supplierId, quantity * 100]);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, lot_number, expiry_date, _deleted)
            VALUES ('l1', 'po1', 'p1', ?, 0, 10, 100, ?, 'LOT-1', '2028-01-01', 0)`, [quantity, quantity * 100]);
  };

  const renderScreen = (initialId: string | null = "po1") =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <PoOrderScreen initialId={initialId} />
      </QueryClientProvider>,
    );

  it("leads a walk-in draft with Receive stock and offers no Send to vendor, with Download PDF beside it", async () => {
    seedDraft(null);
    renderScreen();
    expect(await screen.findByRole("button", { name: "Receive stock" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send to vendor" })).toBeNull();
    expect(screen.getByRole("button", { name: /Download PDF/ })).toBeTruthy();
  });

  it("hides Receive stock from a role without receive_purchase_orders", async () => {
    hasPermission.mockImplementation((key) => key !== "receive_purchase_orders");
    seedDraft("s1");
    renderScreen();
    expect(await screen.findByRole("button", { name: "Send to vendor" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Receive stock" })).toBeNull();
  });

  it("leaves on Back with no discard prompt, and the order is still there", async () => {
    seedDraft(null);
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/procurement"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(rows("SELECT COUNT(*) FROM purchase_orders WHERE _deleted = 0")[0][0]).toBe(1);
  });

  it("receives a draft through the confirmation sheet, booking the saved lot and expiry", async () => {
    seedDraft(null);
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Receive stock" }));
    fireEvent.click(await screen.findByRole("button", { name: "Receive Purchase" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/procurement?selected=po1"));
    expect(rows("SELECT quantity, batch_number, expiry_date FROM stock_batches")).toEqual([[30, "LOT-1", "2028-01-01"]]);
    expect(rows("SELECT status FROM purchase_orders")[0][0]).toBe("received");
  });

  it("sends a vendor's order: marks it ordered and hands its PDF to the share sheet", async () => {
    seedDraft("s1");
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Send to vendor" }));

    await waitFor(() => expect(shareOrDownload).toHaveBeenCalledTimes(1));
    expect(rows("SELECT status FROM purchase_orders")[0][0]).toBe("sent");
    expect(push).toHaveBeenCalledWith("/procurement?selected=po1");
  });

  it("refuses to send an order with an uncounted row", async () => {
    seedDraft("s1", 0);
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Send to vendor" }));
    await waitFor(() => expect(rows("SELECT status FROM purchase_orders")[0][0]).toBe("pending"));
    expect(shareOrDownload).not.toHaveBeenCalled();
  });

  it("says when another device's change won, and reloading their version clears the warning", async () => {
    seedDraft(null);
    db.run(`INSERT INTO _sync_conflicts (table_name, record_id, reason, detected_at) VALUES ('purchase_order_items', 'l1', 'version_conflict', '2026-11-18T09:00:00Z')`);
    renderScreen();

    expect(await screen.findByText(/Your edit wasn't saved because another device changed it first/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reload their version" }));

    await waitFor(() => expect(rows("SELECT resolved_at IS NOT NULL FROM _sync_conflicts")[0][0]).toBe(1));
  });

  it("opens a draft another till is editing read-only, and Take over makes this till the editor", async () => {
    seedDraft(null);
    db.run(`UPDATE purchase_orders SET editing_device_id = 'DRX-COUNTER-2', editing_device_label = 'Counter 2', editing_at = ?`, [new Date().toISOString()]);
    renderScreen();

    expect(await screen.findByText("Being edited on Counter 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Receive stock" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Take over" }));

    const { getDeviceId } = await import("@/lib/utils/device-id");
    await waitFor(() => expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBe(getDeviceId()));
    await waitFor(() => expect(screen.queryByText("Being edited on Counter 2")).toBeNull(), { timeout: 6000 });
  });

  it("releases this till's lock when leaving with Back", async () => {
    seedDraft(null);
    const { getDeviceId } = await import("@/lib/utils/device-id");
    db.run(`UPDATE purchase_orders SET editing_device_id = ?, editing_at = ?`, [getDeviceId(), new Date().toISOString()]);
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/procurement"));
    expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBeNull();
  });
});

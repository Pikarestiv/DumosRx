import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("the order screen never writes a stale copy over another till's work", () => {
  let db: Database;
  let usePoOrderEditor: typeof import("@/components/procurement/order-screen/use-po-order-editor").usePoOrderEditor;
  let thisDevice: string;
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    ({ usePoOrderEditor } = await import("@/components/procurement/order-screen/use-po-order-editor"));
    thisDevice = (await import("@/lib/utils/device-id")).getDeviceId();
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue; DELETE FROM _sync_conflicts;");
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10), ('p2', 'Coartem', 'Tablet', 'Carton', 24)`);
    db.run(`INSERT INTO purchase_orders (id, supplier_id, status, type, total_amount, created_at, _deleted) VALUES ('po1', 's1', 'pending', 'immediate', 300, '2026-11-18T08:00:00Z', 0)`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted)
            VALUES ('l1', 'po1', 'p1', 3, 0, 10, 100, 300, 0)`);
  });

  const openOrder = async () => {
    const hook = renderHook(() => usePoOrderEditor({ initialId: "po1" }), { wrapper });
    await waitFor(() => expect(hook.result.current.loadState).toBe("ready"));
    return hook;
  };

  const anotherTillEdits = () => {
    db.run(`UPDATE purchase_order_items SET bulk_quantity = 9, subtotal = 900 WHERE id = 'l1'`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted)
            VALUES ('l2', 'po1', 'p2', 4, 0, 24, 2400, 9600, 0)`);
  };

  it("keeps what the other till typed after this screen opened when this till takes over", async () => {
    db.run(`UPDATE purchase_orders SET editing_device_id = 'DRX-COUNTER-2', editing_device_label = 'Counter 2', editing_at = ?`, [new Date().toISOString()]);
    const { result } = await openOrder();
    anotherTillEdits();

    await act(() => result.current.takeOver());

    await waitFor(() => expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBe(thisDevice));
    expect(rows("SELECT id, bulk_quantity FROM purchase_order_items WHERE _deleted = 0 ORDER BY id")).toEqual([["l1", 9], ["l2", 4]]);
    expect(result.current.draft.items.map((item) => [item.id, item.bulk_quantity]).sort()).toEqual([["l1", 9], ["l2", 4]]);
  });

  it("refuses to save over lines another till changed since this screen loaded, and says so", async () => {
    const { result } = await openOrder();
    anotherTillEdits();

    act(() => result.current.change((d) => ({ ...d, notes: "Call first" }), "now"));

    await waitFor(() => expect(result.current.autosave.blocked).toBe("stale"));
    expect(rows("SELECT id, bulk_quantity FROM purchase_order_items WHERE _deleted = 0 ORDER BY id")).toEqual([["l1", 9], ["l2", 4]]);
    expect(rows("SELECT notes FROM purchase_orders")[0][0]).toBeNull();
  });

  it("writes nothing after a conflict banner, even before the re-pull has replaced this till's rows", async () => {
    const { result } = await openOrder();
    db.run(`INSERT INTO _sync_conflicts (table_name, record_id, reason, detected_at) VALUES ('purchase_order_items', 'l1', 'version_conflict', '2026-11-19T09:00:00Z')`);

    act(() => result.current.change((d) => ({ ...d, items: [{ ...d.items[0], bulk_quantity: 5 }] }), "now"));

    await waitFor(() => expect(result.current.autosave.blocked).toBe("stale"));
    expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(3);
    expect(rows("SELECT COUNT(*) FROM _sync_queue")[0][0]).toBe(0);
  });

  it("saves again once their version is reloaded", async () => {
    const { result } = await openOrder();
    anotherTillEdits();
    act(() => result.current.change((d) => ({ ...d, notes: "Call first" }), "now"));
    await waitFor(() => expect(result.current.autosave.blocked).toBe("stale"));

    await act(() => result.current.reload());
    act(() => result.current.change((d) => ({ ...d, notes: "Call first" }), "now"));

    await waitFor(() => expect(rows("SELECT notes FROM purchase_orders")[0][0]).toBe("Call first"));
    expect(rows("SELECT id, bulk_quantity FROM purchase_order_items WHERE _deleted = 0 ORDER BY id")).toEqual([["l1", 9], ["l2", 4]]);
  });

  it("does not mistake this till's own earlier save, read back from the server, for another till's edit", async () => {
    const { result } = await openOrder();
    act(() => result.current.change((d) => ({ ...d, items: [{ ...d.items[0], bulk_quantity: 6 }] }), "now"));
    await waitFor(() => expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(6));
    db.run(`UPDATE purchase_order_items SET bulk_quantity = 6.0, unit_cost = '100.00', _version = 2 WHERE id = 'l1'`);
    db.run(`UPDATE purchase_orders SET _version = 2, updated_at = '2026-11-19T10:00:00.000000Z'`);

    act(() => result.current.change((d) => ({ ...d, notes: "Second pass" }), "now"));

    await waitFor(() => expect(rows("SELECT notes FROM purchase_orders")[0][0]).toBe("Second pass"));
    expect(result.current.autosave.blocked).toBeNull();
  });
});

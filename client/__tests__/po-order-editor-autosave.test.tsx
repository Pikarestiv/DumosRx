import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const line = (overrides: Partial<POLineItemDraft> = {}): POLineItemDraft => ({
  id: "l1", product_id: "p1", product_name: "Panadol", bulk_unit: "Carton",
  bulk_quantity: 0, units_per_bulk: 10, unit_cost: 100, subtotal: 0, ...overrides,
});

describe("order screen autosave", () => {
  let db: Database;
  let usePoOrderEditor: typeof import("@/components/procurement/order-screen/use-po-order-editor").usePoOrderEditor;
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    ({ usePoOrderEditor } = await import("@/components/procurement/order-screen/use-po-order-editor"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue;");
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10)`);
    window.history.replaceState(null, "", "/procurement/new");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderNew = () => renderHook(() => usePoOrderEditor({ initialId: null }), { wrapper });

  it("writes nothing for vendor or notes alone, then creates the draft and swaps the address on the first item", async () => {
    const { result } = renderNew();

    act(() => result.current.change((d) => ({ ...d, notes: "Monday run" }), "now"));
    await waitFor(() => expect(result.current.autosave.saveState).toBe("saved"));
    expect(rows("SELECT COUNT(*) FROM purchase_orders")[0][0]).toBe(0);

    act(() => result.current.change((d) => ({ ...d, items: [line()] }), "now"));
    await waitFor(() => expect(result.current.autosave.persisted).toBe(true));

    expect(rows("SELECT id, notes FROM purchase_orders")).toEqual([[result.current.orderId, "Monday run"]]);
    expect(window.location.pathname + window.location.search).toBe(`/procurement/edit?id=${result.current.orderId}`);
  });

  it("saves a burst of typing once, after the pause", async () => {
    const { result } = renderNew();
    act(() => result.current.change((d) => ({ ...d, items: [line()] }), "now"));
    await waitFor(() => expect(result.current.autosave.persisted).toBe(true));
    db.run("DELETE FROM _sync_queue");

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    for (const qty of [1, 12, 120]) {
      act(() => result.current.change((d) => ({ ...d, items: [line({ bulk_quantity: qty })] }), "debounced"));
      await act(() => vi.advanceTimersByTimeAsync(200));
    }
    expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(700));
    vi.useRealTimers();
    await waitFor(() => expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(120));
    expect(rows("SELECT COUNT(*) FROM _sync_queue WHERE table_name = 'purchase_order_items'")[0][0]).toBe(1);
  });

  it("saves a pending edit straight away when the page is hidden or closed", async () => {
    const { result } = renderNew();
    act(() => result.current.change((d) => ({ ...d, items: [line()] }), "now"));
    await waitFor(() => expect(result.current.autosave.persisted).toBe(true));

    act(() => result.current.change((d) => ({ ...d, items: [line({ bulk_quantity: 9 })] }), "debounced"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    await waitFor(() => expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(9));
  });

  it("undoes the last edit and saves the order as it was", async () => {
    const { result } = renderNew();
    act(() => result.current.change((d) => ({ ...d, items: [line({ bulk_quantity: 4 })] }), "now"));
    await waitFor(() => expect(result.current.autosave.persisted).toBe(true));
    act(() => result.current.change((d) => ({ ...d, items: [line({ bulk_quantity: 4 }), line({ id: "l2", product_id: "p1" })] }), "now"));
    await waitFor(() => expect(rows("SELECT COUNT(*) FROM purchase_order_items WHERE _deleted = 0")[0][0]).toBe(2));

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    });

    await waitFor(() => expect(rows("SELECT id FROM purchase_order_items WHERE _deleted = 0")).toEqual([["l1"]]));
    expect(result.current.draft.items).toHaveLength(1);
  });

  it("reverts one field of an opened order back to what it was", async () => {
    db.run(`INSERT INTO purchase_orders (id, status, type, total_amount, _deleted) VALUES ('po-open', 'pending', 'immediate', 300, 0)`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, lot_number, _deleted)
            VALUES ('l1', 'po-open', 'p1', 3, 10, 100, 300, 'LOT-A', 0)`);
    const { result } = renderHook(() => usePoOrderEditor({ initialId: "po-open" }), { wrapper });
    await waitFor(() => expect(result.current.loadState).toBe("ready"));

    act(() => result.current.change((d) => ({ ...d, items: [{ ...d.items[0], bulk_quantity: 8, lot_number: "LOT-B" }] }), "now"));
    await waitFor(() => expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(8));

    act(() => result.current.revert("l1", "bulk_quantity"));

    await waitFor(() => expect(rows("SELECT bulk_quantity, lot_number FROM purchase_order_items")[0]).toEqual([3, "LOT-B"]));
  });

  it("stops saving over an order another till has received in the meantime", async () => {
    const { result } = renderNew();
    act(() => result.current.change((d) => ({ ...d, items: [line({ bulk_quantity: 2 })] }), "now"));
    await waitFor(() => expect(result.current.autosave.persisted).toBe(true));
    db.run(`UPDATE purchase_orders SET status = 'received'`);

    act(() => result.current.change((d) => ({ ...d, items: [line({ bulk_quantity: 7 })] }), "now"));

    await waitFor(() => expect(result.current.autosave.blocked).toBe("not_editable"));
    expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(2);
  });
});

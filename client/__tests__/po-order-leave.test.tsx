import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
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
  bulk_quantity: 1, units_per_bulk: 10, unit_cost: 100, subtotal: 100, ...overrides,
});

describe("leaving the order screen", () => {
  let db: Database;
  let usePoOrderEditor: typeof import("@/components/procurement/order-screen/use-po-order-editor").usePoOrderEditor;
  let isDraftDeletePending: typeof import("@/components/procurement/order-screen/schedule-draft-delete").isDraftDeletePending;
  let scheduleDraftDelete: typeof import("@/components/procurement/order-screen/schedule-draft-delete").scheduleDraftDelete;
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    ({ usePoOrderEditor } = await import("@/components/procurement/order-screen/use-po-order-editor"));
    ({ isDraftDeletePending, scheduleDraftDelete } = await import("@/components/procurement/order-screen/schedule-draft-delete"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue; DELETE FROM _sync_conflicts;");
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10)`);
  });

  const startOrder = async () => {
    const hook = renderHook(() => usePoOrderEditor({ initialId: null }), { wrapper });
    act(() => hook.result.current.change((d) => ({ ...d, items: [line()] }), "now"));
    await waitFor(() => expect(hook.result.current.autosave.persisted).toBe(true));
    return hook;
  };

  it("saves the last keystroke and frees the lock when the screen goes away without Back", async () => {
    const { result, unmount } = await startOrder();
    expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).not.toBeNull();

    act(() => result.current.change((d) => ({ ...d, items: [line({ bulk_quantity: 9 })] }), "debounced"));
    unmount();

    await waitFor(() => expect(rows("SELECT bulk_quantity FROM purchase_order_items")[0][0]).toBe(9));
    await waitFor(() => expect(rows("SELECT editing_device_id FROM purchase_orders")[0][0]).toBeNull());
  });

  it("deletes, behind the undo toast, a draft left with no items, and keeps one that still has items", async () => {
    const emptied = await startOrder();
    const emptiedId = emptied.result.current.orderId;
    act(() => emptied.result.current.change((d) => ({ ...d, items: [] }), "now"));
    await waitFor(() => expect(rows("SELECT COUNT(*) FROM purchase_order_items WHERE _deleted = 0")[0][0]).toBe(0));
    emptied.unmount();
    await waitFor(() => expect(isDraftDeletePending(emptiedId)).toBe(true));

    const kept = await startOrder();
    const keptId = kept.result.current.orderId;
    kept.unmount();
    await waitFor(() => expect(rows(`SELECT editing_device_id FROM purchase_orders WHERE id = '${keptId}'`)[0][0]).toBeNull());
    expect(isDraftDeletePending(keptId)).toBe(false);
  });

  it("will not open a draft while its delete can still be undone", async () => {
    db.run(`INSERT INTO purchase_orders (id, status, type, total_amount, _deleted) VALUES ('po-going', 'pending', 'immediate', 100, 0)`);
    scheduleDraftDelete("po-going", { onUndo: () => {}, showToast: () => {} });

    const { result } = renderHook(() => usePoOrderEditor({ initialId: "po-going" }), { wrapper });

    await waitFor(() => expect(result.current.loadState).toBe("missing"));
  });

  it("leaves native undo alone while the cursor is in a text box", async () => {
    const { result } = await startOrder();
    act(() => result.current.change((d) => ({ ...d, notes: "first" }), "now"));
    const input = document.createElement("input");
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    });

    expect(result.current.draft.notes).toBe("first");
    input.remove();
  });
});

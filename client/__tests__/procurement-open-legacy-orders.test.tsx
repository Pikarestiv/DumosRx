import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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

interface LegacyOrder {
  name: string;
  status: string;
  type: string | null;
  payment: [string | null, number | null];
  dueDate: string | null;
  lines: [number, number, string | null][];
  editable: boolean;
}

const LEGACY_ORDERS: LegacyOrder[] = [
  { name: "an Immediate draft with uncounted rows", status: "pending", type: "immediate", payment: ["unpaid", 0], dueDate: null, lines: [[0, 0, "LOT-1"], [3, 0, null]], editable: true },
  { name: "a standard draft whose Immediate-only fields were cleared", status: "pending", type: "standard", payment: ["unpaid", 0], dueDate: "2026-12-01", lines: [[5, 0, null]], editable: true },
  { name: "a sent order", status: "sent", type: "standard", payment: ["partial", 2000], dueDate: "2026-12-01", lines: [[5, 0, null]], editable: true },
  { name: "a paid order whose amount was never stored", status: "pending", type: "immediate", payment: ["paid", null], dueDate: null, lines: [[2, 0, null]], editable: true },
  { name: "a paid order that still carries a due date", status: "sent", type: "immediate", payment: ["paid", 5000], dueDate: "2026-12-01", lines: [[5, 0, null]], editable: true },
  { name: "a partially received order", status: "partially_received", type: "standard", payment: ["unpaid", 0], dueDate: null, lines: [[5, 2, null]], editable: false },
  { name: "a row still in the legacy draft status", status: "draft", type: null, payment: [null, null], dueDate: null, lines: [[1, 0, null]], editable: false },
];

describe("opening an order saved before the one-screen flow", () => {
  let db: Database;
  let usePoOrderEditor: typeof import("@/components/procurement/order-screen/use-po-order-editor").usePoOrderEditor;
  const snapshotOf = () => [
    db.exec("SELECT * FROM purchase_orders")[0]?.values,
    db.exec("SELECT * FROM purchase_order_items ORDER BY id")[0]?.values,
  ];

  beforeAll(async () => {
    ({ usePoOrderEditor } = await import("@/components/procurement/order-screen/use-po-order-editor"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue;");
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10)`);
  });

  it.each(LEGACY_ORDERS)("writes nothing at all when $name is merely opened", async (order) => {
    db.run(
      `INSERT INTO purchase_orders (id, supplier_id, status, type, payment_status, amount_paid, due_date, total_amount, created_at, updated_at, editing_device_id, editing_at, _deleted)
       VALUES ('po1', 'sup1', ?, ?, ?, ?, ?, 5000, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', NULL, NULL, 0)`,
      [order.status, order.type, order.payment[0], order.payment[1], order.dueDate],
    );
    order.lines.forEach(([quantity, received, lot], index) =>
      db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, lot_number, _deleted)
              VALUES (?, 'po1', 'p1', ?, ?, 10, 1000, ?, ?, 0)`, [`l${index}`, quantity, received, quantity * 1000, lot]));
    const before = snapshotOf();

    const { result, unmount } = renderHook(() => usePoOrderEditor({ initialId: "po1" }), { wrapper });
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(result.current.isEditable).toBe(order.editable);
    unmount();
    await waitFor(() => expect(db.exec("SELECT COUNT(*) FROM _sync_queue")[0].values[0][0]).toBe(0));

    expect(snapshotOf()).toEqual(before);
    expect(db.exec("SELECT COUNT(*) FROM audit_logs")[0].values[0][0]).toBe(0);
  });
});

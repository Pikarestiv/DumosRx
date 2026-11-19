import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { pushChanges: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const ORDER = "aaaa1111-0000-4000-8000-000000000001";

describe("till B's offline order edits, rejected because till A changed the order first", () => {
  let db: Database;
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };
  let toast: { warning: ReturnType<typeof vi.fn> };
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as { apiClient: { pushChanges: ReturnType<typeof vi.fn> } });
    ({ toast } = (await import("sonner")) as unknown as { toast: { warning: ReturnType<typeof vi.fn> } });
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM purchase_orders; DELETE FROM purchase_order_items; DELETE FROM _sync_queue; DELETE FROM _sync_conflicts; DELETE FROM _sync_state; DELETE FROM audit_logs;`);
    vi.clearAllMocks();
  });

  const tillBTypedOffline = () => {
    db.run(`INSERT INTO purchase_orders (id, supplier_id, status, type, notes, amount_paid, total_amount, editing_device_id, _synced) VALUES (?, 's1', 'pending', 'immediate', 'B notes', 0, 0, 'DRX-B', 0)`, [ORDER]);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, cost_price_override, lot_number, expiry_date, _synced) VALUES
      ('l1', ?, 'p1', 7, 10, 100, 700, NULL, 'LOT-B', '2028-03-01', 0),
      ('l2', ?, 'p2', 4, 24, 2400, 9600, 90, NULL, NULL, 0)`, [ORDER, ORDER]);
  };

  const queue = (table: string, recordId: string, operation: string, payload: Record<string, unknown>) =>
    db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES (?, ?, ?, ?, '2026-11-19T00:00:00Z') RETURNING id`,
      [table, recordId, operation, JSON.stringify(payload)],
    )[0].values[0][0] as number;

  const pushRejected = async () => {
    const header = queue("purchase_orders", ORDER, "UPDATE", { id: ORDER, supplier_id: "s1", notes: "B notes", amount_paid: 0, editing_device_id: "DRX-B" });
    const edit = queue("purchase_order_items", "l1", "UPDATE", { id: "l1", bulk_quantity: 7, units_per_bulk: 10, lot_number: "LOT-B" });
    const added = queue("purchase_order_items", "l2", "INSERT", { id: "l2", po_id: ORDER, product_id: "p2", bulk_quantity: 4, units_per_bulk: 24 });
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [
        { id: header, table_name: "purchase_orders", record_id: ORDER, reason: "version_conflict" },
        { id: edit, table_name: "purchase_order_items", record_id: "l1", reason: "draft_locked" },
        { id: added, table_name: "purchase_order_items", record_id: "l2", reason: "draft_locked" },
      ],
    });
    await pushChanges();
  };

  const rePullTillAVersion = () => {
    db.run(`UPDATE purchase_orders SET notes = 'A notes', editing_device_id = 'DRX-A' WHERE id = ?`, [ORDER]);
    db.run(`UPDATE purchase_order_items SET bulk_quantity = 3, lot_number = NULL, expiry_date = NULL WHERE id = 'l1'`);
    db.run(`DELETE FROM purchase_order_items WHERE id = 'l2'`);
  };

  const recoveredCopies = () => rows(`SELECT id, supplier_id, status, notes, amount_paid FROM purchase_orders WHERE id != '${ORDER}' AND _deleted = 0`);

  it("keeps everything B typed as a new draft after the re-pull puts A's version back", async () => {
    tillBTypedOffline();
    await pushRejected();
    rePullTillAVersion();

    const [copy] = recoveredCopies();
    expect(copy.slice(1)).toEqual(["s1", "pending", "Recovered copy of PO-AAAA1111: B notes", 0]);
    expect(rows(`SELECT product_id, bulk_quantity, units_per_bulk, unit_cost, cost_price_override, lot_number, expiry_date, quantity_received FROM purchase_order_items WHERE po_id = '${copy[0]}' ORDER BY product_id`)).toEqual([
      ["p1", 7, 10, 100, null, "LOT-B", "2028-03-01", 0],
      ["p2", 4, 24, 2400, 90, null, null, 0],
    ]);
    expect(rows(`SELECT COUNT(*) FROM purchase_order_items WHERE po_id = '${copy[0]}' AND id IN ('l1', 'l2')`)[0][0]).toBe(0);
    expect(rows(`SELECT COUNT(*) FROM _sync_queue WHERE record_id = '${copy[0]}' AND operation = 'INSERT'`)[0][0]).toBe(1);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('"Recovered copy of PO-AAAA1111"'), expect.anything());
  });

  it("does not make a second copy when the same rejected edits come back again", async () => {
    tillBTypedOffline();
    await pushRejected();
    await pushRejected();

    expect(recoveredCopies()).toHaveLength(1);
  });

  it("makes no copy when only the lock stamp was refused, since nothing B typed was lost", async () => {
    tillBTypedOffline();
    const stamp = queue("purchase_orders", ORDER, "UPDATE", { id: ORDER, editing_at: "2026-11-19T00:03:00Z", editing_device_id: "DRX-B" });
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: stamp, table_name: "purchase_orders", record_id: ORDER, reason: "version_conflict" }],
    });

    await pushChanges();

    expect(recoveredCopies()).toHaveLength(0);
  });
});

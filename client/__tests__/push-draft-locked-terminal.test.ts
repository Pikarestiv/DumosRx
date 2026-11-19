import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { pushChanges: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

describe("a purchase-order line the server refused because another till holds the draft", () => {
  let db: Database;
  let pushChanges: typeof import("@/lib/db/sync-engine/push").pushChanges;
  let apiClient: { pushChanges: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ pushChanges } = await import("@/lib/db/sync-engine/push"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as { apiClient: { pushChanges: ReturnType<typeof vi.fn> } });
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM purchase_order_items; DELETE FROM _sync_queue; DELETE FROM _sync_conflicts; DELETE FROM _sync_state;`);
    vi.clearAllMocks();
  });

  it("drops the queued line edit and records it for the order screen's banner", async () => {
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, _synced) VALUES ('l1', 'po1', 'p1', 3, 10, 100, 300, 0)`);
    const queueId = db.exec(
      `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
       VALUES ('purchase_order_items', 'l1', 'UPDATE', '{"id":"l1","bulk_quantity":3,"units_per_bulk":10}', '2026-11-19T00:00:00Z') RETURNING id`,
    )[0].values[0][0] as number;
    apiClient.pushChanges.mockResolvedValueOnce({
      success: true,
      processed: 0,
      failed: [{ id: queueId, table_name: "purchase_order_items", record_id: "l1", reason: "draft_locked" }],
    });

    await pushChanges();

    expect(db.exec(`SELECT COUNT(*) FROM _sync_queue`)[0].values[0][0]).toBe(0);
    expect(db.exec(`SELECT record_id, reason FROM _sync_conflicts`)[0].values).toEqual([["l1", "draft_locked"]]);
  });
});

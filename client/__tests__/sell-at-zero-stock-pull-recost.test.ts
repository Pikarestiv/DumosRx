import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const toastWarning = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { warning: toastWarning, error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));

vi.mock("@/lib/api/client", () => ({
  apiClient: { pullChanges: vi.fn(), pushChanges: vi.fn() },
}));

describe("a pull re-costs the sales its settlement and sale-line rows name", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let pullChanges: typeof import("@/lib/db/sync-engine/pull").pullChanges;
  let apiClient: { pullChanges: ReturnType<typeof vi.fn>; pushChanges: ReturnType<typeof vi.fn> };

  const settlementRow = (id: string, units: number, unitCost: number) => ({
    id, product_id: "p1", stock_batch_id: "b1", movement_type: "adjustment", quantity: -units, unit_cost: unitCost,
    reference_type: "backorder_settlement", reference_id: "S", reason: "Already sold before this delivery",
    movement_date: "2026-10-26T10:00:00Z", updated_at: "2026-10-26T10:00:00.000000Z", _version: 1,
  });

  const seedLocalSettlement = (id: string, units: number, unitCost: number) =>
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, movement_date, _version, _synced, _deleted)
       VALUES ('${id}', 'p1', 'b1', 'adjustment', ${-units}, ${unitCost}, 'backorder_settlement', 'S', '2026-10-26T09:00:00Z', 1, 1, 0)`,
    );

  const pull = async (changes: Record<string, unknown[]>) => {
    apiClient.pullChanges.mockResolvedValueOnce({ success: true, changes, server_timestamp: "2026-10-26T12:00:00Z" });
    await pullChanges();
  };

  const line = () => db.exec(`SELECT cost_price, _version FROM sale_items WHERE id = 'line-S'`)[0].values[0];
  const queuedLineUpdates = () =>
    Number(db.exec(`SELECT COUNT(*) FROM _sync_queue WHERE table_name = 'sale_items'`)[0].values[0][0]);

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ pullChanges } = await import("@/lib/db/sync-engine/pull"));
    ({ apiClient } = (await import("@/lib/api/client")) as unknown as { apiClient: { pullChanges: ReturnType<typeof vi.fn>; pushChanges: ReturnType<typeof vi.fn> } });
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE sale_items ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM _sync_state; DELETE FROM _sync_queue; DELETE FROM _pending_stock_deltas; DELETE FROM stock_batches;
       DELETE FROM stock_movements; DELETE FROM products; DELETE FROM sales; DELETE FROM sale_items; DELETE FROM audit_logs;`,
    );
    db.run(`INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Cement', 0)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, _deleted) VALUES ('b1', 'p1', 0, 0)`);
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price, _version, _synced, _deleted)
       VALUES ('line-S', 'S', 'p1', 5, 20, 100, 10, 1, 1, 0)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, unit_cost, reference_type, reference_id, movement_date, _version, _synced, _deleted)
       VALUES ('owed-S', 'p1', 'b1', 'adjustment', 5, 10, 'backorder', 'S', '2026-10-26T08:00:00Z', 1, 1, 0)`,
    );
    vi.clearAllMocks();
  });

  it("puts back the cost both settlements give after another till's partial re-cost overwrites it", async () => {
    seedLocalSettlement("settle-A", 3, 12);
    seedLocalSettlement("settle-B", 2, 15);
    db.run(`UPDATE sale_items SET cost_price = 13.2 WHERE id = 'line-S'`);

    await pull({
      sale_items: [{ id: "line-S", sale_id: "S", product_id: "p1", quantity: 5, unit_price: 20, total_price: 100,
        cost_price: 11.2, _version: 2, updated_at: "2026-10-26T11:00:00.000000Z" }],
    });

    expect(line()[0]).toBe(13.2);
  });

  it("re-costs a sale when another till's settlement arrives by pull", async () => {
    await pull({ stock_movements: [settlementRow("settle-A", 3, 12)] });

    expect(line()[0]).toBe(11.2);
  });

  it("writes nothing when the pulled rows leave the cost where it already is", async () => {
    seedLocalSettlement("settle-A", 3, 12);
    db.run(`UPDATE sale_items SET cost_price = 11.2, _version = 2 WHERE id = 'line-S'`);

    await pull({ stock_movements: [settlementRow("settle-A", 3, 12)] });
    await pull({
      sale_items: [{ id: "line-S", sale_id: "S", product_id: "p1", quantity: 5, unit_price: 20, total_price: 100,
        cost_price: 11.2, _version: 2, updated_at: "2026-10-26T11:00:00.000000Z" }],
    });

    expect(line()).toEqual([11.2, 2]);
    expect(queuedLineUpdates()).toBe(0);
  });

  describe("the hook can never abort a pull", () => {
    const settlementLanded = () =>
      Number(db.exec(`SELECT COUNT(*) FROM stock_movements WHERE id = 'settle-A'`)[0].values[0][0]);

    it("lets the page commit during an on-till inspection session, re-costing nothing", async () => {
      const { startTillInspectionSession, endTillInspectionSession } = await import("@/lib/utils/till-inspection");
      startTillInspectionSession({
        admin: { id: "a", first_name: "A", last_name: "B", email: "a@b.c", role: "super_admin" },
        sessionId: "s", hardExpiresAt: new Date(Date.now() + 3.6e6).toISOString(),
        idleExpiresAt: new Date(Date.now() + 3.6e6).toISOString(), storeId: null, deviceId: "d",
      } as Parameters<typeof startTillInspectionSession>[0]);
      try {
        await pull({ stock_movements: [settlementRow("settle-A", 3, 12)] });
      } finally {
        endTillInspectionSession();
      }

      expect(settlementLanded()).toBe(1);
      expect(line()[0]).toBe(10);
    });

    it("re-costs against the pull run's store when the ambient active store has changed", async () => {
      db.run(`UPDATE sale_items SET store_id = 'store-run'`);
      core.setActiveStoreId("store-other");
      apiClient.pullChanges.mockResolvedValueOnce({
        success: true, changes: { stock_movements: [settlementRow("settle-A", 3, 12)] }, server_timestamp: "2026-10-26T12:00:00Z",
      });
      try {
        await pullChanges(false, false, undefined, { id: "run-1", storeId: "store-run" });
      } finally {
        core.setActiveStoreId(null);
      }

      expect(settlementLanded()).toBe(1);
      expect(line()[0]).toBe(11.2);
    });

    it("logs and swallows a re-cost failure so the page still commits", async () => {
      db.run(`ALTER TABLE sale_items RENAME TO sale_items_away`);
      try {
        await pull({ stock_movements: [settlementRow("settle-A", 3, 12)] });
      } finally {
        db.run(`ALTER TABLE sale_items_away RENAME TO sale_items`);
      }

      expect(settlementLanded()).toBe(1);
    });
  });

  it("drops a re-cost refused on a stale version without a toast, then re-derives on the server's row", async () => {
    const { pushChanges } = await import("@/lib/db/sync-engine/push");
    await pull({ stock_movements: [settlementRow("settle-A", 3, 12)] });
    const queued = db.exec(`SELECT id, record_id FROM _sync_queue WHERE table_name = 'sale_items'`)[0].values;
    expect(queued).toHaveLength(1);

    apiClient.pushChanges.mockImplementation(async (body: { changes: { id: number; table_name: string; record_id: string }[] }) => ({
      success: true,
      processed: body.changes.length - 1,
      failed: body.changes
        .filter((c) => c.table_name === "sale_items")
        .map((c) => ({ id: c.id, table_name: c.table_name, record_id: c.record_id, reason: "version_conflict" })),
    }));
    await pushChanges();
    apiClient.pushChanges.mockReset();

    expect(toastWarning).not.toHaveBeenCalled();
    await pull({
      sale_items: [{ id: "line-S", sale_id: "S", product_id: "p1", quantity: 5, unit_price: 20, total_price: 100,
        cost_price: 11.2, _version: 2, updated_at: "2026-10-26T11:00:00.000000Z" }],
    });
    expect(line()).toEqual([11.2, 2]);
    expect(queuedLineUpdates()).toBe(0);
  });
});

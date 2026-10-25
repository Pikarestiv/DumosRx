import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import {
  OVERSELL_COMPENSATION_REASON,
  OVERSELL_REFERENCE_TYPE,
  STOCK_LOSS_REASON_LABELS,
} from "@/lib/constants/stock-adjustments";
import { adjustmentSourceLabel, groupAdjustmentMovements } from "@/components/stock-batch/adjustment-derivations";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";

describe("an oversell writes an inbound compensation so the log never sums below zero (A-265)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory").recordSaleItemStock;
  let getBatchDeficits: typeof import("@/lib/db/batch-quantity").getBatchDeficits;
  let getStockLossTotal: typeof import("@/lib/db/queries/finance").getStockLossTotal;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert } = await import("@/lib/db/base-helpers"));
    ({ recordSaleItemStock } = await import("@/lib/db/queries/inventory"));
    ({ getBatchDeficits } = await import("@/lib/db/batch-quantity"));
    ({ getStockLossTotal } = await import("@/lib/db/queries/finance"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    for (const table of ["stock_batches", "products", "stock_movements", "sale_items", "sale_item_batches"]) {
      try {
        db.run(`ALTER TABLE ${table} ADD COLUMN store_id TEXT`);
      } catch (error) {
        if (!String(error).includes("duplicate column")) throw error;
      }
    }
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM sale_items; DELETE FROM sale_item_batches; DELETE FROM stock_movements; DELETE FROM stock_batches;
       DELETE FROM products; DELETE FROM _sync_queue; DELETE FROM audit_logs;`,
    );
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('gluformin', 'Gluformin', 0, '${STORE_ID}')`);
    db.run(`DELETE FROM _sync_state`);
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at) VALUES ('${STORE_ID}', 'stock_movements', '2026-10-25T00:00:00Z')`,
    );
  });

  function seedBatch(id: string, received: number, expiry = "2099-01-01") {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, expiry_date, is_active, _deleted, store_id)
       VALUES ('${id}', 'gluformin', 'Opening Stock', ${received}, 50, '${expiry}', 1, 0, '${STORE_ID}')`,
    );
    if (received > 0) {
      db.run(
        `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted, store_id)
         VALUES ('in-${id}', 'gluformin', '${id}', 'purchase', ${received}, 0, '${STORE_ID}')`,
      );
    }
  }

  const sell = (quantity: number, saleId = "sale-1") =>
    recordSaleItemStock({
      saleId,
      productId: "gluformin",
      quantity,
      unitPrice: 100,
      costPrice: 50,
      subtotal: 100 * quantity,
      cashierId: "cashier-1",
    });

  const stored = (batchId: string) =>
    db.exec(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`)[0].values[0][0];

  const logSum = (batchId: string) =>
    db.exec(`SELECT COALESCE(SUM(quantity), 0) FROM stock_movements WHERE stock_batch_id = '${batchId}' AND _deleted = 0`)[0]
      .values[0][0];

  const compensations = () =>
    db.exec(
      `SELECT stock_batch_id, quantity, movement_type, reference_id, reason, total_cost FROM stock_movements WHERE reference_type = '${OVERSELL_REFERENCE_TYPE}'`,
    )[0]?.values ?? [];

  const count = (batchId: string, delta: number) =>
    insert("stock_movements", {
      product_id: "gluformin",
      stock_batch_id: batchId,
      movement_type: "adjustment",
      quantity: delta,
      reference_type: "stock_audit",
      reason: "Inventory count",
    });

  it("the live case: 4 received and 6 sold leaves the batch at 0, and a count of 2 reads 2 first time", async () => {
    seedBatch("b1", 4);

    await sell(6);

    expect(compensations()).toEqual([["b1", 2, "adjustment", "sale-1", OVERSELL_COMPENSATION_REASON, 100]]);
    expect(logSum("b1")).toBe(0);
    expect(stored("b1")).toBe(0);

    await count("b1", 2);
    expect(stored("b1")).toBe(2);
  });

  it("writes no compensation on a device whose movement log is incomplete, since the units may be in a row it has not pulled", async () => {
    db.run(`UPDATE _sync_state SET server_cursor = '{"id":"x"}' WHERE table_name = 'stock_movements'`);
    seedBatch("b1", 4);

    await sell(6);

    expect(compensations()).toEqual([]);
    expect(stored("b1")).toBe(0);
  });

  it("writes no compensation for a sale within stock", async () => {
    seedBatch("b1", 4);

    await sell(3);

    expect(compensations()).toEqual([]);
    expect(db.exec(`SELECT COUNT(*) FROM stock_movements WHERE reference_id = 'sale-1'`)[0].values[0][0]).toBe(1);
    expect(stored("b1")).toBe(1);
  });

  it("compensates only the remainder, on the batch that was oversold, when a sale spans two batches", async () => {
    seedBatch("near", 2, "2098-01-01");
    seedBatch("far", 3, "2099-01-01");

    await sell(7);

    const rows = compensations();
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe(2);
    expect(logSum("near") as number).toBeGreaterThanOrEqual(0);
    expect(logSum("far") as number).toBeGreaterThanOrEqual(0);
    expect((stored("near") as number) + (stored("far") as number)).toBe(0);
  });

  it("compensates the whole line when the product had no batch at all", async () => {
    await sell(3);

    const [[batchId, quantity]] = compensations() as [string, number][];
    expect(quantity).toBe(3);
    expect(stored(batchId)).toBe(0);

    await count(batchId, 1);
    expect(stored(batchId)).toBe(1);
  });

  it("writes nothing for a legacy batch whose stock was never logged", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, expiry_date, is_active, _deleted, store_id)
       VALUES ('legacy', 'gluformin', 'Legacy', 100, 50, '2099-01-01', 1, 0, '${STORE_ID}')`,
    );

    await sell(5);

    expect(compensations()).toEqual([]);
    expect(stored("legacy")).toBe(95);
  });

  it("leaves no deficit for the dashboard's oversold alert to report", async () => {
    seedBatch("b1", 4);

    await sell(6);

    expect(await getBatchDeficits()).toEqual([]);
  });

  it("is not counted as a stock loss", async () => {
    seedBatch("b1", 4);
    await sell(6);

    expect(await getStockLossTotal({ from: "2000-01-01", to: "2999-01-01" })).toBe(0);
    const reason: string = OVERSELL_COMPENSATION_REASON;
    for (const label of STOCK_LOSS_REASON_LABELS) {
      expect(reason.startsWith(label)).toBe(false);
    }
  });

  it("shows in the Stock Adjustments ledger as an oversell, not a cycle count", async () => {
    seedBatch("b1", 4);
    await sell(6);

    const rows = db.exec(`SELECT * FROM stock_movements WHERE movement_type = 'adjustment'`)[0];
    const movements = rows.values.map(
      (values) => Object.fromEntries(rows.columns.map((column, i) => [column, values[i]])) as unknown as StockMovementDbRow,
    );
    const [group] = groupAdjustmentMovements(movements);

    expect(group.source).toBe(OVERSELL_REFERENCE_TYPE);
    expect(group.netQuantity).toBe(2);
    expect(adjustmentSourceLabel(group.source)).toBe("Oversell");
  });

  it("agrees with the server's per-push floor through the sale and a later count", async () => {
    seedBatch("b1", 4);
    await sell(6);
    const saleDeltas = db.exec(`SELECT quantity FROM stock_movements WHERE reference_id = 'sale-1'`)[0].values.map(
      ([quantity]) => quantity as number,
    );
    const applyPush = (stock: number, deltas: number[]) => Math.max(0, stock + deltas.reduce((sum, d) => sum + d, 0));

    const serverAfterSale = applyPush(4, saleDeltas);
    await count("b1", 2);

    expect(serverAfterSale).toBe(0);
    expect(applyPush(serverAfterSale, [2])).toBe(stored("b1"));
  });

  it("stays out of the dashboard's recent-activity feed, where the sale already has its own entry", async () => {
    seedBatch("b1", 4);
    await sell(6);
    const { getDashboardOverviewData } = await import("@/lib/db/queries/dashboard-overview");

    core.setActiveStoreId(null);
    const { recentActivities } = await getDashboardOverviewData().finally(() => core.setActiveStoreId(STORE_ID));

    expect(JSON.stringify(recentActivities)).not.toContain(OVERSELL_REFERENCE_TYPE);
    expect(db.exec(`SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'oversell'`)[0].values[0][0]).toBe(1);
  });
});

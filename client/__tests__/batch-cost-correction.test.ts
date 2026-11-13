import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";

describe("correctBatchCostPrice", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let correctBatchCostPrice: typeof import("@/lib/db/queries/batch-cost-correction").correctBatchCostPrice;
  let getProductHistory: typeof import("@/lib/db/queries/products").getProductHistory;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ correctBatchCostPrice } = await import("@/lib/db/queries/batch-cost-correction"));
    ({ getProductHistory } = await import("@/lib/db/queries/products"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE stock_batches ADD COLUMN store_id TEXT`);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT`);
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
    core.setCurrentUser({ id: "owner-1", first_name: "Cynthia", last_name: "Agidi", role: "store_owner" });
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stock_batches; DELETE FROM products; DELETE FROM sale_items;
       DELETE FROM _sync_queue; DELETE FROM audit_logs;`,
    );
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('prod-1', 'Amoxil 500mg', 0, '${STORE_ID}')`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, _version, store_id)
       VALUES ('batch-1', 'prod-1', 'LOT-7', 20, 1200, 1, 0, 4, '${STORE_ID}')`,
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, stock_batch_id, quantity, unit_price, cost_price, total_price)
       VALUES ('si-1', 'sale-1', 'prod-1', 'batch-1', 2, 1500, 1200, 3000)`,
    );
  });

  const scalar = (sql: string) => db.exec(sql)[0]?.values[0]?.[0];

  it("writes the corrected cost to the batch and leaves its quantity alone", async () => {
    await correctBatchCostPrice("batch-1", 120);

    expect(scalar(`SELECT cost_price FROM stock_batches WHERE id = 'batch-1'`)).toBe(120);
    expect(scalar(`SELECT quantity FROM stock_batches WHERE id = 'batch-1'`)).toBe(20);
  });

  it("keeps the cost a past sale was sold at", async () => {
    await correctBatchCostPrice("batch-1", 120);

    expect(scalar(`SELECT cost_price FROM sale_items WHERE id = 'si-1'`)).toBe(1200);
  });

  it("queues a cost-only UPDATE carrying the batch's current version for the server's conflict check", async () => {
    await correctBatchCostPrice("batch-1", 120);

    const payload = JSON.parse(
      String(scalar(`SELECT payload FROM _sync_queue WHERE table_name = 'stock_batches' AND record_id = 'batch-1' AND operation = 'UPDATE'`)),
    );
    expect(payload.cost_price).toBe(120);
    expect(payload._version).toBe(4);
    expect(payload).not.toHaveProperty("quantity");
  });

  it("records who changed the cost, from what, to what", async () => {
    await correctBatchCostPrice("batch-1", 120);

    const [action, userId, details] = db.exec(
      `SELECT action, user_id, details FROM audit_logs WHERE table_name = 'stock_batches' AND record_id = 'batch-1'`,
    )[0].values[0];
    expect(action).toBe("BATCH_COST_CORRECTED");
    expect(userId).toBe("owner-1");
    expect(JSON.parse(String(details))).toMatchObject({
      previous_cost_price: 1200,
      cost_price: 120,
      batch_number: "LOT-7",
      product_id: "prod-1",
    });
  });

  it("shows the correction in the product's own history", async () => {
    await correctBatchCostPrice("batch-1", 120);

    const { auditLogs } = await getProductHistory("prod-1");
    expect(auditLogs.map((log) => log.action)).toContain("BATCH_COST_CORRECTED");
  });

  it("rounds to two decimal places", async () => {
    await correctBatchCostPrice("batch-1", 120.456);

    expect(scalar(`SELECT cost_price FROM stock_batches WHERE id = 'batch-1'`)).toBe(120.46);
  });

  it("allows a zero cost on an empty batch", async () => {
    db.run(`UPDATE stock_batches SET quantity = 0 WHERE id = 'batch-1'`);

    await correctBatchCostPrice("batch-1", 0);

    expect(scalar(`SELECT cost_price FROM stock_batches WHERE id = 'batch-1'`)).toBe(0);
  });

  it.each([
    ["negative", -1],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["absurdly large", 1e12],
  ])("rejects a %s cost without writing anything", async (_label, cost) => {
    await expect(correctBatchCostPrice("batch-1", cost)).rejects.toThrow(/cost price/i);

    expect(scalar(`SELECT cost_price FROM stock_batches WHERE id = 'batch-1'`)).toBe(1200);
    expect(scalar(`SELECT COUNT(*) FROM _sync_queue`)).toBe(0);
    expect(scalar(`SELECT COUNT(*) FROM audit_logs`)).toBe(0);
  });

  it("refuses a deleted batch", async () => {
    db.run(`UPDATE stock_batches SET _deleted = 1 WHERE id = 'batch-1'`);

    await expect(correctBatchCostPrice("batch-1", 120)).rejects.toThrow(/batch/i);
    expect(scalar(`SELECT COUNT(*) FROM _sync_queue`)).toBe(0);
  });

  it("writes nothing when the cost has not changed", async () => {
    await correctBatchCostPrice("batch-1", 1200);

    expect(scalar(`SELECT COUNT(*) FROM _sync_queue`)).toBe(0);
    expect(scalar(`SELECT COUNT(*) FROM audit_logs`)).toBe(0);
  });
});

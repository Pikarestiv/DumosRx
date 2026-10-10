import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const STORE_ID = "store-1";

/**
 * A-148: a 'sync_reconciliation' movement is a real, permanent record, but
 * it is a sync correction rather than a stock event — so it must not appear
 * in the owner's day-to-day Stock Movements list, nor inflate the
 * added/removed stock-value figures. See client/AGENTS.md.
 */
describe("sync_reconciliation movement visibility", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let localDb: typeof import("@/lib/db/local-database");
  let inventory: typeof import("@/lib/db/queries/inventory");
  let reports: typeof import("@/lib/db/queries/reports");
  let products: typeof import("@/lib/db/queries/products");

  const insertMovement = (
    id: string,
    movementType: string,
    quantity: number,
  ) => {
    db.run(
      `INSERT INTO stock_movements
         (id, stock_batch_id, product_id, store_id, movement_type, quantity,
          unit_cost, reason, movement_date, created_at, updated_at, _deleted)
       VALUES (?, 'batch-1', 'product-1', ?, ?, ?, 10, 'reason', ?, ?, ?, 0)`,
      [id, STORE_ID, movementType, quantity, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()],
    );
  };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    localDb = await import("@/lib/db/local-database");
    inventory = await import("@/lib/db/queries/inventory");
    reports = await import("@/lib/db/queries/reports");
    products = await import("@/lib/db/queries/products");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    );
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;`);
    core.setActiveStoreId(STORE_ID);
    db.run(
      `INSERT INTO products (id, name, store_id, selling_price, _deleted)
       VALUES ('product-1', 'Paracetamol', ?, 500, 0)`,
      [STORE_ID],
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, store_id, quantity, cost_price, _deleted)
       VALUES ('batch-1', 'product-1', ?, 100, 10, 0)`,
      [STORE_ID],
    );
  });

  it("getStockMovements hides a sync_reconciliation row but keeps real movements", async () => {
    insertMovement("mv-sale", "sale", -4);
    insertMovement("mv-recon", "sync_reconciliation", 250);

    const { data } = await localDb.getStockMovements();

    expect(data.map((row) => row.id)).toEqual(["mv-sale"]);
  });

  it("getStockAdjustments does not surface a sync_reconciliation row", async () => {
    insertMovement("mv-adjust", "adjustment", -2);
    insertMovement("mv-recon", "sync_reconciliation", 250);

    const { data } = await localDb.getStockAdjustments();

    expect(data.map((row) => row.id)).toEqual(["mv-adjust"]);
  });

  it("getStockMoM counts neither a positive nor a negative sync_reconciliation into added/removed value", async () => {
    insertMovement("mv-recon-up", "sync_reconciliation", 250);
    insertMovement("mv-recon-down", "sync_reconciliation", -250);

    const mom = await inventory.getStockMoM();

    expect(mom.currentValue).toBe(1000);
    expect(mom.previousValue).toBe(1000);
    expect(mom.percentChange).toBe(0);
  });

  it("getProductHistory hides a sync_reconciliation row but keeps real movements", async () => {
    insertMovement("mv-sale", "sale", -4);
    insertMovement("mv-recon", "sync_reconciliation", 250);

    const { stockMovements } = await products.getProductHistory("product-1");

    expect(stockMovements.map((row) => row.id)).toEqual(["mv-sale"]);
  });

  it("the dashboard recent-activity feed never surfaces a sync_reconciliation row", async () => {
    insertMovement("mv-recon", "sync_reconciliation", 250);

    const overview = await reports.getDashboardOverviewData();

    expect(
      overview.recentActivities.some(
        (activity) => (activity as { id?: string }).id === "mv-recon",
      ),
    ).toBe(false);
  });

  /**
   * A-221: the A-214 repair writes compensating `sync_reconciliation_reversal`
   * movements, which are the same kind of row for the same reason and must be
   * hidden in the same three places.
   */
  describe("sync_reconciliation_reversal is hidden in exactly the same places", () => {
    it("getStockMovements hides it", async () => {
      insertMovement("mv-sale", "sale", -4);
      insertMovement("mv-reversal", "sync_reconciliation_reversal", -250);

      const { data } = await localDb.getStockMovements();

      expect(data.map((row) => row.id)).toEqual(["mv-sale"]);
    });

    it("getProductHistory hides it", async () => {
      insertMovement("mv-sale", "sale", -4);
      insertMovement("mv-reversal", "sync_reconciliation_reversal", -250);

      const { stockMovements } = await products.getProductHistory("product-1");

      expect(stockMovements.map((row) => row.id)).toEqual(["mv-sale"]);
    });

    it("the dashboard recent-activity feed never surfaces it", async () => {
      insertMovement("mv-reversal", "sync_reconciliation_reversal", -250);

      const overview = await reports.getDashboardOverviewData();

      expect(
        overview.recentActivities.some(
          (activity) => (activity as { id?: string }).id === "mv-reversal",
        ),
      ).toBe(false);
    });

    it("getStockMoM's explicit allowlists still exclude it", async () => {
      insertMovement("mv-reversal-up", "sync_reconciliation_reversal", 250);
      insertMovement("mv-reversal-down", "sync_reconciliation_reversal", -250);

      const mom = await inventory.getStockMoM();

      expect(mom.currentValue).toBe(1000);
      expect(mom.previousValue).toBe(1000);
      expect(mom.percentChange).toBe(0);
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

/**
 * getLowStockAlerts, getExpiryAlerts and getExpiringBatches were uncovered
 * despite carrying the subtlest rule in the stock layer: what counts as
 * on-hand. Low stock deliberately ignores expired and deactivated batches
 * (stock the sale path can't dispense), the expiry alert covers only the
 * next 30 days and deliberately drops already-expired batches, while the
 * expiring-batches list deliberately keeps them.
 */
describe("inventory stock alerts", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let q: typeof import("@/lib/db/queries/inventory");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    q = await import("@/lib/db/queries/inventory");

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
    db.run(`DELETE FROM products; DELETE FROM stock_batches;`);
    core.setActiveStoreId(null);
  });

  function seedProduct(
    id: string,
    name: string,
    reorderLevel: number,
    storeId?: string,
    isActive: number | null = 1,
  ) {
    db.run(
      `INSERT INTO products (id, name, reorder_level, base_unit, store_id, is_active, _deleted)
       VALUES (?, ?, ?, 'Unit', ?, ?, 0)`,
      [id, name, reorderLevel, storeId ?? null, isActive],
    );
  }

  function seedBatch(
    id: string,
    productId: string,
    opts: {
      quantity: number;
      expiry?: string | null;
      isActive?: number;
      deleted?: number;
    },
  ) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, expiry_date, is_active, _deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        productId,
        `B-${id}`,
        opts.quantity,
        opts.expiry ?? null,
        opts.isActive ?? 1,
        opts.deleted ?? 0,
      ],
    );
  }

  describe("getLowStockAlerts", () => {
    it("flags a product whose dispensable stock is at or below its reorder level", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 10, expiry: iso(200) });

      const rows = await q.getLowStockAlerts();
      expect(rows).toEqual([
        { product: "Panadol", quantity: 10, threshold: 10, baseUnit: "Unit" },
      ]);
    });

    it("leaves a well-stocked product alone", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 11, expiry: iso(200) });

      expect(await q.getLowStockAlerts()).toEqual([]);
    });

    it("still flags a product whose entire stock has expired", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 500, expiry: iso(-1) });

      const rows = await q.getLowStockAlerts();
      expect(rows.map((r) => [r.product, r.quantity])).toEqual([["Panadol", 0]]);
    });

    it("still flags a product whose entire stock sits in a deactivated batch", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 500, expiry: iso(200), isActive: 0 });

      expect((await q.getLowStockAlerts())[0].quantity).toBe(0);
    });

    it("counts a batch with no expiry date recorded as dispensable", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 500, expiry: null });

      expect(await q.getLowStockAlerts()).toEqual([]);
    });

    it("judges a multi-batch product on its total, not on one batch at a time", async () => {
      // Regression: `HAVING quantity <= m.reorder_level` resolved the bare
      // `quantity` to stock_batches.quantity (a single batch's raw figure)
      // rather than to the SUM aliased above it, so a product with 16 units
      // spread over two 8-unit batches was reported as low against a reorder
      // level of 10 — while reporting its quantity as the correct 16.
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 8, expiry: iso(200) });
      seedBatch("b2", "p1", { quantity: 8, expiry: iso(200) });

      expect(await q.getLowStockAlerts()).toEqual([]);
    });

    it("sums a product's batches rather than reporting each one", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 4, expiry: iso(100) });
      seedBatch("b2", "p1", { quantity: 3, expiry: iso(200) });

      const rows = await q.getLowStockAlerts();
      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe(7);
    });

    it("ignores a product with no reorder level set, however empty it is", async () => {
      seedProduct("p1", "Panadol", 0);

      expect(await q.getLowStockAlerts()).toEqual([]);
    });

    it("reports the emptiest products first and caps the list at five", async () => {
      for (let i = 0; i < 7; i++) {
        seedProduct(`p${i}`, `Product ${i}`, 10);
        seedBatch(`b${i}`, `p${i}`, { quantity: i, expiry: iso(200) });
      }

      const rows = await q.getLowStockAlerts();
      expect(rows.map((r) => r.quantity)).toEqual([0, 1, 2, 3, 4]);
    });

    it("ignores a deactivated product, matching getStockBatchStats's population", async () => {
      seedProduct("p1", "Retired", 10, undefined, 0);
      seedBatch("b1", "p1", { quantity: 2, expiry: iso(200) });

      expect(await q.getLowStockAlerts()).toEqual([]);
    });

    it("still flags a product whose is_active was never recorded", async () => {
      seedProduct("p1", "Legacy", 10, undefined, null);
      seedBatch("b1", "p1", { quantity: 2, expiry: iso(200) });

      expect((await q.getLowStockAlerts()).map((r) => r.product)).toEqual(["Legacy"]);
    });

    it("agrees with getStockBatchStats on how many products are low or critical", async () => {
      seedProduct("p1", "Live low", 10);
      seedBatch("b1", "p1", { quantity: 2, expiry: iso(200) });
      seedProduct("p2", "Live critical", 10);
      seedProduct("p3", "Retired low", 10, undefined, 0);
      seedBatch("b3", "p3", { quantity: 2, expiry: iso(200) });

      const stats = await q.getStockBatchStats();
      const rows = await q.getLowStockAlerts();
      expect(rows).toHaveLength(stats.low_stock_count + stats.critical_stock_count);
      expect(rows.map((r) => r.product).sort()).toEqual(["Live critical", "Live low"]);
    });

    it("reports only the active store's products", async () => {
      seedProduct("p1", "Here", 10, "store-a");
      seedProduct("p2", "Elsewhere", 10, "store-b");

      core.setActiveStoreId("store-a");
      const rows = await q.getLowStockAlerts();
      expect(rows.map((r) => r.product)).toEqual(["Here"]);
    });
  });

  describe("getExpiryAlerts", () => {
    it("reports a batch expiring inside the next 30 days with its days left", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(10) });

      const rows = await q.getExpiryAlerts();
      expect(rows).toHaveLength(1);
      expect(rows[0].product).toBe("Panadol");
      expect(rows[0].daysLeft).toBeGreaterThanOrEqual(9);
      expect(rows[0].daysLeft).toBeLessThanOrEqual(10);
    });

    it("ignores a batch expiring beyond the 30-day window", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(45) });

      expect(await q.getExpiryAlerts()).toEqual([]);
    });

    it("ignores an already-expired batch, which belongs on the write-off list instead", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(-3) });

      expect(await q.getExpiryAlerts()).toEqual([]);
    });

    it("ignores a batch with a blank expiry date", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: "" });

      expect(await q.getExpiryAlerts()).toEqual([]);
    });

    it("ignores a soft-deleted batch", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(10), deleted: 1 });

      expect(await q.getExpiryAlerts()).toEqual([]);
    });

    it("reports the soonest expiry first", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(20) });
      seedBatch("b2", "p1", { quantity: 5, expiry: iso(3) });

      const rows = await q.getExpiryAlerts();
      expect(rows[0].expiryDate).toBe(iso(3));
    });

    it("reports only the active store's batches", async () => {
      seedProduct("p1", "Here", 10, "store-a");
      seedProduct("p2", "Elsewhere", 10, "store-b");
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(5) });
      seedBatch("b2", "p2", { quantity: 5, expiry: iso(5) });

      core.setActiveStoreId("store-a");
      const rows = await q.getExpiryAlerts();
      expect(rows.map((r) => r.product)).toEqual(["Here"]);
    });
  });

  describe("getExpiringBatches", () => {
    it("defaults to a 90-day window, never narrower than the UI promises", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(80) });
      seedBatch("b2", "p1", { quantity: 5, expiry: iso(100) });

      const rows = await q.getExpiringBatches();
      expect(rows.map((r) => r.expiry_date)).toEqual([iso(80)]);
    });

    it("honours a caller-supplied window", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(45) });

      expect(await q.getExpiringBatches(30)).toEqual([]);
      expect(await q.getExpiringBatches(60)).toHaveLength(1);
    });

    it("keeps an already-expired batch in the list, unlike getExpiryAlerts", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(-10) });

      expect(await q.getExpiringBatches()).toHaveLength(1);
    });

    it("skips a batch that has already been sold out", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 0, expiry: iso(10) });

      expect(await q.getExpiringBatches()).toEqual([]);
    });

    it("skips a batch with no expiry date at all", async () => {
      seedProduct("p1", "Panadol", 10);
      seedBatch("b1", "p1", { quantity: 5, expiry: null });

      expect(await q.getExpiringBatches()).toEqual([]);
    });

    it("reports only the active store's batches", async () => {
      seedProduct("p1", "Here", 10, "store-a");
      seedProduct("p2", "Elsewhere", 10, "store-b");
      seedBatch("b1", "p1", { quantity: 5, expiry: iso(10) });
      seedBatch("b2", "p2", { quantity: 5, expiry: iso(10) });

      core.setActiveStoreId("store-a");
      const rows = await q.getExpiringBatches();
      expect(rows.map((r) => r.name)).toEqual(["Here"]);
    });
  });
});

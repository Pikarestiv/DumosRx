import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * The end-of-day summary reads (payment-method totals, transaction count,
 * top staff) and the POS's two product-suggestion rankings were all
 * uncovered. The summary reads are what a pharmacy reconciles its cash
 * drawer against, and all three bound the day on the STORE's local wall
 * clock while transaction_date holds a UTC instant — the exact boundary bug
 * already fixed in getRecentSales.
 */
describe("EOD summary and POS suggestion queries", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let q: typeof import("@/lib/db/queries/sales");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    q = await import("@/lib/db/queries/sales");

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
    db.run(`DELETE FROM sales; DELETE FROM sale_items; DELETE FROM users;`);
    core.setActiveStoreId(null);
  });

  /** A UTC instant for the given local wall-clock time on 2026-09-20. */
  function localInstant(hour: number, minute = 0, day = 20) {
    return new Date(2026, 8, day, hour, minute, 0, 0).toISOString();
  }

  function seedSale(
    id: string,
    opts: {
      total: number;
      method?: string;
      at: string;
      userId?: string | null;
      storeId?: string | null;
    },
  ) {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, transaction_date, user_id, store_id, _deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        `TXN-${id}`,
        opts.total,
        opts.total,
        opts.method ?? "cash",
        opts.at,
        opts.userId ?? null,
        opts.storeId ?? null,
      ],
    );
  }

  describe("getSalesTotalsByPaymentMethod", () => {
    it("sums each payment method separately for the day", async () => {
      seedSale("s1", { total: 100, method: "cash", at: localInstant(9) });
      seedSale("s2", { total: 50, method: "cash", at: localInstant(14) });
      seedSale("s3", { total: 70, method: "transfer", at: localInstant(16) });

      const rows = await q.getSalesTotalsByPaymentMethod("2026-09-20");
      const byMethod = Object.fromEntries(rows.map((r) => [r.payment_method, r.total]));
      expect(byMethod).toEqual({ cash: 150, transfer: 70 });
    });

    it("includes a sale at the very start and very end of the store's local day", async () => {
      seedSale("s1", { total: 10, at: localInstant(0, 0) });
      seedSale("s2", { total: 20, at: localInstant(23, 59) });

      const rows = await q.getSalesTotalsByPaymentMethod("2026-09-20");
      expect(rows[0].total).toBe(30);
    });

    it("excludes a sale from late the previous local evening", async () => {
      seedSale("s1", { total: 10, at: localInstant(23, 30, 19) });

      expect(await q.getSalesTotalsByPaymentMethod("2026-09-20")).toEqual([]);
    });

    it("excludes a soft-deleted sale", async () => {
      seedSale("s1", { total: 10, at: localInstant(9) });
      db.run(`UPDATE sales SET _deleted = 1 WHERE id = 's1'`);

      expect(await q.getSalesTotalsByPaymentMethod("2026-09-20")).toEqual([]);
    });

    it("counts only the active store's sales", async () => {
      seedSale("s1", { total: 10, at: localInstant(9), storeId: "store-a" });
      seedSale("s2", { total: 90, at: localInstant(9), storeId: "store-b" });

      core.setActiveStoreId("store-a");
      const rows = await q.getSalesTotalsByPaymentMethod("2026-09-20");
      expect(rows[0].total).toBe(10);
    });
  });

  describe("getTransactionCountByDate", () => {
    it("counts the day's sales", async () => {
      seedSale("s1", { total: 10, at: localInstant(9) });
      seedSale("s2", { total: 10, at: localInstant(10) });
      seedSale("s3", { total: 10, at: localInstant(9, 0, 21) });

      expect(await q.getTransactionCountByDate("2026-09-20")).toBe(2);
    });

    it("returns 0 rather than undefined for a day with no sales", async () => {
      expect(await q.getTransactionCountByDate("2026-09-20")).toBe(0);
    });

    it("counts only the active store's sales", async () => {
      seedSale("s1", { total: 10, at: localInstant(9), storeId: "store-a" });
      seedSale("s2", { total: 10, at: localInstant(9), storeId: "store-b" });

      core.setActiveStoreId("store-b");
      expect(await q.getTransactionCountByDate("2026-09-20")).toBe(1);
    });
  });

  describe("getTopStaffByDate", () => {
    beforeEach(() => {
      db.run(
        `INSERT INTO users (id, first_name, last_name, pin, role) VALUES ('u1', 'Ada', 'Obi', 'x', 'pharmacist')`,
      );
      db.run(
        `INSERT INTO users (id, first_name, last_name, pin, role) VALUES ('u2', 'Bem', NULL, 'x', 'cashier')`,
      );
    });

    it("ranks staff by the day's takings, highest first", async () => {
      seedSale("s1", { total: 100, at: localInstant(9), userId: "u1" });
      seedSale("s2", { total: 40, at: localInstant(10), userId: "u2" });
      seedSale("s3", { total: 30, at: localInstant(11), userId: "u2" });

      const rows = await q.getTopStaffByDate("2026-09-20");
      expect(rows.map((r) => [r.user_name, r.total_sales])).toEqual([
        ["Ada Obi", 100],
        ["Bem", 70],
      ]);
    });

    it("omits staff with no sales that day", async () => {
      seedSale("s1", { total: 100, at: localInstant(9), userId: "u1" });

      const rows = await q.getTopStaffByDate("2026-09-20");
      expect(rows.map((r) => r.user_name)).toEqual(["Ada Obi"]);
    });

    it("drops a sale with no user attached rather than reporting a blank staff row", async () => {
      seedSale("s1", { total: 100, at: localInstant(9), userId: null });

      expect(await q.getTopStaffByDate("2026-09-20")).toEqual([]);
    });

    it("counts only the active store's sales", async () => {
      seedSale("s1", { total: 100, at: localInstant(9), userId: "u1", storeId: "store-a" });
      seedSale("s2", { total: 500, at: localInstant(9), userId: "u2", storeId: "store-b" });

      core.setActiveStoreId("store-a");
      const rows = await q.getTopStaffByDate("2026-09-20");
      expect(rows.map((r) => r.user_name)).toEqual(["Ada Obi"]);
    });
  });

  describe("product suggestion rankings", () => {
    function seedItem(
      id: string,
      productId: string,
      quantity: number,
      createdAt: string,
      storeId?: string,
    ) {
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, created_at, store_id)
         VALUES (?, 's1', ?, ?, 10, ?, ?, ?)`,
        [id, productId, quantity, quantity * 10, createdAt, storeId ?? null],
      );
    }

    it("ranks recently-sold products by each product's own latest sale", async () => {
      // p-old also has a very recent line: it must rank on that, not on its
      // oldest one.
      seedItem("i1", "p-old", 1, "2026-01-01T00:00:00Z");
      seedItem("i2", "p-old", 1, "2026-09-27T00:00:00Z");
      seedItem("i3", "p-mid", 1, "2026-05-01T00:00:00Z");

      expect(await q.getRecentlySoldProductIds()).toEqual(["p-old", "p-mid"]);
    });

    it("returns one entry per product and at most five", async () => {
      for (let i = 0; i < 7; i++) {
        seedItem(`i${i}`, `p${i}`, 1, `2026-0${i + 1}-01T00:00:00Z`);
        seedItem(`i${i}b`, `p${i}`, 1, `2026-0${i + 1}-02T00:00:00Z`);
      }
      const ids = await q.getRecentlySoldProductIds();
      expect(ids).toEqual(["p6", "p5", "p4", "p3", "p2"]);
    });

    it("ranks commonly-sold products by total quantity, not line count", async () => {
      seedItem("i1", "p-bulk", 50, "2026-01-01T00:00:00Z");
      seedItem("i2", "p-often", 1, "2026-02-01T00:00:00Z");
      seedItem("i3", "p-often", 2, "2026-03-01T00:00:00Z");
      seedItem("i4", "p-often", 3, "2026-04-01T00:00:00Z");

      expect(await q.getCommonlySoldProductIds()).toEqual(["p-bulk", "p-often"]);
    });

    it("restricts both rankings to the active store", async () => {
      seedItem("i1", "p-a", 1, "2026-09-01T00:00:00Z", "store-a");
      seedItem("i2", "p-b", 99, "2026-09-02T00:00:00Z", "store-b");

      core.setActiveStoreId("store-a");
      expect(await q.getRecentlySoldProductIds()).toEqual(["p-a"]);
      expect(await q.getCommonlySoldProductIds()).toEqual(["p-a"]);
    });

    it("returns empty lists when nothing has ever been sold", async () => {
      expect(await q.getRecentlySoldProductIds()).toEqual([]);
      expect(await q.getCommonlySoldProductIds()).toEqual([]);
    });
  });
});

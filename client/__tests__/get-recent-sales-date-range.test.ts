import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";

/**
 * getRecentSales's undated form caps at LIMIT 100 - fine for a general
 * "recent sales" list, but wrong for use-my-today-sales.ts's "my sales
 * today" total, which used to call it undated and filter for "today"
 * client-side afterward: a cashier who personally rang more than 100
 * sales today would have the earliest ones silently dropped before the
 * "is today" filter even ran. Passing a dateRange raises the cap to 500
 * and does the filtering in SQL instead - this covers that the higher cap
 * actually applies and every same-day row comes back.
 */
describe("getRecentSales with a dateRange", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getRecentSales: typeof import("@/lib/db/queries/sales").getRecentSales;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    getRecentSales = (await import("@/lib/db/queries/sales")).getRecentSales;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales;`);
    core.setActiveStoreId(null);
  });

  function insertSale(id: string, createdAt: string) {
    db.run(
      `INSERT INTO sales (id, transaction_number, user_id, subtotal, total_amount, payment_method, transaction_date, created_at, _deleted)
       VALUES (?, ?, 'user-1', 100, 100, 'cash', ?, ?, 0)`,
      [id, `TXN-${id}`, createdAt, createdAt],
    );
  }

  it("returns more than 100 same-day rows for one cashier when a dateRange is passed", async () => {
    const today = "2026-09-23";
    for (let i = 0; i < 120; i++) {
      insertSale(`s${i}`, `${today}T10:${String(i % 60).padStart(2, "0")}:00.000Z`);
    }
    // A handful of older sales from the same cashier must not leak in.
    insertSale("old-1", "2026-09-20T10:00:00.000Z");

    const rows = await getRecentSales("user-1", { from: today, to: today });
    expect(rows.length).toBe(120);
  });

  it("still caps the undated form at 100, matching the pre-existing behavior", async () => {
    for (let i = 0; i < 120; i++) {
      insertSale(`s${i}`, `2026-09-23T10:${String(i % 60).padStart(2, "0")}:00.000Z`);
    }

    const rows = await getRecentSales("user-1");
    expect(rows.length).toBe(100);
  });
});

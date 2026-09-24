import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
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
  let originalTZ: string | undefined;

  beforeAll(async () => {
    // Africa/Lagos (UTC+1, no DST) so local and UTC calendar dates genuinely
    // differ near midnight - see reports-timezone.test.ts, same pattern.
    originalTZ = process.env.TZ;
    process.env.TZ = "Africa/Lagos";

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

  /**
   * The dateRange is a LOCAL calendar date, but created_at is a UTC instant.
   * At UTC+1, 2026-09-23T23:30Z is already 2026-09-24 00:30 on the store's
   * wall clock, so it belongs to the NEXT local day. Bucketing it by literal
   * UTC midnight put it on 09-23 instead - understating "today" for every
   * store off UTC+0.
   */
  it("buckets a sale near local midnight by the LOCAL day, not the UTC day", async () => {
    insertSale("late-utc", "2026-09-23T23:30:00.000Z"); // 2026-09-24 00:30 local
    insertSale("mid-day-23", "2026-09-23T10:00:00.000Z"); // 2026-09-23 11:00 local

    const day24 = await getRecentSales("user-1", { from: "2026-09-24", to: "2026-09-24" });
    expect(day24.map((r) => r.id)).toEqual(["late-utc"]);

    const day23 = await getRecentSales("user-1", { from: "2026-09-23", to: "2026-09-23" });
    expect(day23.map((r) => r.id)).toEqual(["mid-day-23"]);
  });

  it("excludes a sale that is still the previous local day at UTC+1", async () => {
    // 2026-09-23T23:59:59.999Z is 2026-09-24 00:59 local => next local day.
    // 2026-09-22T23:30:00.000Z is 2026-09-23 00:30 local => in range.
    insertSale("early-local-23", "2026-09-22T23:30:00.000Z");
    insertSale("next-local-day", "2026-09-23T23:59:59.999Z");

    const day23 = await getRecentSales("user-1", { from: "2026-09-23", to: "2026-09-23" });
    expect(day23.map((r) => r.id)).toEqual(["early-local-23"]);
  });

  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });
});

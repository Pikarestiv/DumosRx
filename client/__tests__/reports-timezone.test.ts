import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for KNOWN_BUGS.md #9: "Sales Today" filtered with
 * date(transaction_date) = <local today>, comparing a UTC calendar date
 * against a locally-computed "today" string — for any store not in UTC+0,
 * a sale near local midnight fell on the wrong side of that comparison and
 * silently vanished from the dashboard. Fixed by adding the 'localtime'
 * modifier so the comparison is apples-to-apples.
 *
 * Runs with TZ=Africa/Lagos (UTC+1) so the two calendar dates genuinely
 * differ near midnight, proving the fix rather than coincidentally passing
 * in a UTC test environment.
 */
describe("getDashboardOverviewData timezone handling", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getDashboardOverviewData: typeof import("@/lib/db/queries/reports").getDashboardOverviewData;
  let originalTZ: string | undefined;

  beforeAll(async () => {
    originalTZ = process.env.TZ;
    process.env.TZ = "Africa/Lagos";

    core = await import("@/lib/db/core");
    const reports = await import("@/lib/db/queries/reports");
    getDashboardOverviewData = reports.getDashboardOverviewData;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE sales (
        id TEXT PRIMARY KEY, transaction_number TEXT, transaction_date TEXT, total_amount REAL,
        payment_method TEXT, user_id TEXT, created_at TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE returns (
        id TEXT PRIMARY KEY, sale_id TEXT, reason TEXT, total_refunded REAL, user_id TEXT,
        created_at TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE users (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT);
      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY, product_id TEXT, movement_type TEXT, quantity INTEGER,
        reference_type TEXT, performed_by TEXT, created_at TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT, selling_price REAL, category_id TEXT, created_at TEXT,
        _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY, status TEXT, created_at TEXT, ordered_by TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE expenses (
        id TEXT PRIMARY KEY, description TEXT, created_at TEXT, user_id TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE prescriptions (
        id TEXT PRIMARY KEY, status TEXT, created_at TEXT, user_id TEXT, _deleted INTEGER DEFAULT 0
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM returns;`);
  });

  it("counts a sale made just after local midnight, even though its UTC calendar date is still yesterday", async () => {
    // "Now": 2026-01-01T10:00:00Z -> Lagos local is also Jan 1 (11:00), so
    // "today" (local) = Jan 1.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));

    // Sale at 2025-12-31T23:30:00Z: UTC calendar date is Dec 31, but Lagos
    // local (+1h) is 2026-01-01T00:30 -> local calendar date is Jan 1, i.e.
    // "today". The old date(transaction_date) = 'today' comparison used the
    // raw UTC date (Dec 31) and would exclude this sale entirely.
    db.run(
      `INSERT INTO sales (id, transaction_date, total_amount, payment_method) VALUES ('s1', '2025-12-31T23:30:00.000Z', 1500, 'cash')`,
    );

    const { salesToday } = await getDashboardOverviewData();

    expect(salesToday.total).toBe(1500);
    expect(salesToday.count).toBe(1);
  });

  it("excludes a sale that's genuinely from the local-calendar previous day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));

    // 2025-12-31T20:00:00Z + 1h Lagos = Dec 31 21:00 local -> genuinely
    // yesterday, must NOT be counted as today's sales.
    db.run(
      `INSERT INTO sales (id, transaction_date, total_amount, payment_method) VALUES ('s2', '2025-12-31T20:00:00.000Z', 1500, 'cash')`,
    );

    const { salesToday } = await getDashboardOverviewData();

    expect(salesToday.total ?? 0).toBe(0);
    expect(salesToday.count ?? 0).toBe(0);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Numerator/denominator population coverage for the dashboard's ratio-style
 * tiles (the docs/KNOWN_BUGS.md "Dashboard ratio metrics haven't had a
 * numerator/denominator definition review" methodology item). Each case pins
 * the population a ratio's *denominator* draws from, so a future query change
 * can't silently put two different populations on the two sides of a
 * percentage again:
 *
 * 1. Dashboard "x% vs yesterday": today's side has always been net of
 *    refunds, but yesterday's was gross, so any refund at all reported a fake
 *    drop. refundsYesterday makes both sides net.
 * 2. BI "Net Sales +x% vs last period" / "Avg. Transaction +x%": the current
 *    period is Net Sales (total_amount - tax - refunds); the previous period
 *    was raw, tax-inclusive total_amount.
 * 3. BI "Total Customers +x% vs last period": the value is the all-time
 *    customer count, but the baseline counted only customers created *during*
 *    the previous window.
 * 4. Stock "Total stock value, +x% from last month": the card's value counts
 *    every non-deleted batch (getStockBatchStats), while the percentage's
 *    baseline counted only is_active = 1 batches.
 */
describe("dashboard ratio metrics: denominator populations", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getDashboardOverviewData: typeof import("@/lib/db/queries/reports").getDashboardOverviewData;
  let getBIMetrics: typeof import("@/lib/db/queries/reports").getBIMetrics;
  let getStockMoM: typeof import("@/lib/db/queries/inventory").getStockMoM;
  let getStockBatchStats: typeof import("@/lib/db/queries/inventory").getStockBatchStats;
  let originalTZ: string | undefined;

  beforeAll(async () => {
    originalTZ = process.env.TZ;
    // Fixed UTC so the local-calendar "today"/"yesterday" boundaries in
    // getDashboardOverviewData are predictable.
    process.env.TZ = "UTC";

    core = await import("@/lib/db/core");
    ({ getDashboardOverviewData, getBIMetrics } = await import("@/lib/db/queries/reports"));
    ({ getStockMoM, getStockBatchStats } = await import("@/lib/db/queries/inventory"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM products; DELETE FROM stock_batches; DELETE FROM stock_movements; DELETE FROM sales; DELETE FROM sale_items; DELETE FROM returns; DELETE FROM return_items; DELETE FROM customers; DELETE FROM expenses; DELETE FROM users;`,
    );
    core.setActiveStoreId(null);
  });

  it("nets refunds out of yesterday's revenue too, counting only refunds issued yesterday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    db.run(
      `INSERT INTO sales (id, transaction_number, total_amount, subtotal, tax_amount, transaction_date, payment_method, _deleted) VALUES
        ('s-today', 'TXN-1', 1000, 1000, 0, '2026-01-15T09:00:00.000Z', 'cash', 0),
        ('s-yest', 'TXN-2', 1000, 1000, 0, '2026-01-14T09:00:00.000Z', 'cash', 0),
        ('s-older', 'TXN-3', 5000, 5000, 0, '2026-01-10T09:00:00.000Z', 'cash', 0)`,
    );
    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES
        ('r-yest', 's-yest', 'u1', 400, '2026-01-14T15:00:00.000Z', 0),
        ('r-today', 's-today', 'u1', 100, '2026-01-15T09:30:00.000Z', 0),
        ('r-older', 's-older', 'u1', 900, '2026-01-10T15:00:00.000Z', 0)`,
    );

    const data = await getDashboardOverviewData();

    // Numerator (today): gross 1000 less today's 100 refund = 900.
    expect(data.salesToday.total).toBe(1000);
    expect(data.refundsToday.total).toBe(100);
    // Denominator (yesterday): same definition - gross 1000 less the 400
    // refund *issued yesterday*. Neither today's nor an older day's refund
    // may leak into it.
    expect(data.salesYesterday.total).toBe(1000);
    expect(data.refundsYesterday.total).toBe(400);
  });

  it("reports no refunds for yesterday when none were issued that day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));

    db.run(
      `INSERT INTO sales (id, transaction_number, total_amount, subtotal, tax_amount, transaction_date, payment_method, _deleted) VALUES
        ('s-yest', 'TXN-2', 800, 800, 0, '2026-01-14T09:00:00.000Z', 'cash', 0)`,
    );

    const data = await getDashboardOverviewData();

    expect(data.salesYesterday.total).toBe(800);
    expect(data.refundsYesterday.total ?? 0).toBe(0);
  });

  it("measures the previous period's revenue net of its own tax and refunds, like the current period's Net Sales", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T00:00:00.000Z"));

    const prevFrom = "2026-01-01T00:00:00.000Z";
    const from = "2026-01-10T00:00:00.000Z";

    db.run(
      `INSERT INTO sales (id, transaction_number, total_amount, subtotal, tax_amount, transaction_date, _deleted) VALUES
        ('s-prev', 'TXN-1', 1000, 900, 100, '2026-01-05T09:00:00.000Z', 0),
        ('s-curr', 'TXN-2', 2000, 1800, 200, '2026-01-12T09:00:00.000Z', 0)`,
    );
    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES
        ('r-prev', 's-prev', 'u1', 200, '2026-01-06T09:00:00.000Z', 0),
        ('r-curr', 's-curr', 'u1', 500, '2026-01-13T09:00:00.000Z', 0)`,
    );

    const metrics = await getBIMetrics(from, prevFrom);

    // Refunds come back netted to their EX-VAT share (total_refunded is
    // VAT-inclusive, revenue-minus-tax is not - see totalRefundsData in
    // reports.ts): r-prev 200 * (1000 - 100)/1000 = 180, r-curr
    // 500 * (2000 - 200)/2000 = 450.
    // Previous-period Net Sales = 1000 - 100 tax - 180 refunds = 720; the
    // current period's own figure is 2000 - 200 - 450 = 1350. Both sides of
    // revenueChange/avgTransactionChange now come from the same definition.
    expect(metrics.prevRevenueData[0].total).toBe(1000);
    expect(metrics.prevTaxData[0].total).toBe(100);
    expect(metrics.prevRefundsData[0].total).toBeCloseTo(180, 6);
    // The current window's tax/refunds must not bleed into the baseline.
    expect(metrics.taxData[0].total).toBe(200);
    expect(metrics.totalRefundsData[0].total).toBeCloseTo(450, 6);
  });

  it("baselines the customer count against the whole customer base as of the window start, not just the previous window's signups", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T00:00:00.000Z"));

    const prevFrom = "2026-01-01T00:00:00.000Z";
    const from = "2026-01-10T00:00:00.000Z";

    db.run(
      `INSERT INTO customers (id, first_name, last_name, created_at, _deleted) VALUES
        ('c-old', 'Long', 'Standing', '2025-06-01T09:00:00.000Z', 0),
        ('c-prev', 'Prev', 'Window', '2026-01-05T09:00:00.000Z', 0),
        ('c-curr', 'This', 'Window', '2026-01-12T09:00:00.000Z', 0),
        ('c-gone', 'Deleted', 'Person', '2025-06-02T09:00:00.000Z', 1)`,
    );

    const metrics = await getBIMetrics(from, prevFrom);

    // The card's value is the all-time count (3 live customers), so its
    // baseline must be the all-time count as of the window start: c-old +
    // c-prev = 2. Counting only the previous window's signups (1) turned
    // "+x%" into total-over-one-window's-signups nonsense.
    expect(metrics.customerData[0].count).toBe(3);
    expect(metrics.prevCustomerData[0].count).toBe(2);
  });

  it("baselines the stock-value trend on the same batch population the card's value uses (no is_active filter)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T00:00:00.000Z"));

    db.run(
      `INSERT INTO products (id, name, reorder_level, _deleted) VALUES ('p1', 'Paracetamol', 5, 0)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES
        ('b-active', 'p1', 10, 100, 1, 0),
        ('b-null', 'p1', 5, 100, NULL, 0),
        ('b-inactive', 'p1', 2, 100, 0, 0),
        ('b-deleted', 'p1', 99, 100, 1, 1)`,
    );

    const stats = await getStockBatchStats();
    const mom = await getStockMoM();

    // 10*100 + 5*100 + 2*100 = 1700; the soft-deleted batch is excluded from
    // both. The percentage's baseline is derived from currentValue, so it has
    // to start from the very number the card displays.
    expect(stats.total_stock_batch_value).toBe(1700);
    expect(mom.currentValue).toBe(1700);
  });
});

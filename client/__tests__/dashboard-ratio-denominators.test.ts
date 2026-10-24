import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Numerator/denominator population coverage for the dashboard's ratio-style tiles (the docs/KNOWN_BUGS.md "Dashboard ratio…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-dashboard-ratio-denominators-test-ts-L9
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
    // Denominator (yesterday):
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-dashboard-ratio-denominators-test-ts-L97
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

    // Refunds come back netted to their EX-VAT share (total_refunded is VAT-inclusive, revenue-minus-tax is not - see totalRef…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-dashboard-ratio-denominators-test-ts-L139
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

    // The card's value is the all-time count (3 live customers), so its baseline must be the all-time count as of the window s…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-dashboard-ratio-denominators-test-ts-L171
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

    // 10*100 + 5*100 + 2*100 = 1700; the soft-deleted batch is excluded from both.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-dashboard-ratio-denominators-test-ts-L197
    expect(stats.total_stock_batch_value).toBe(1700);
    expect(mom.currentValue).toBe(1700);
  });
});

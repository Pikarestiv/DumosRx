import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// Set before sql.js is instantiated: the wasm build resolves SQLite's
// 'localtime' modifier through the host timezone, so it has to be in place
// before the module/wasm is initialised. Africa/Lagos (UTC+1, no DST) makes
// the UTC and local calendar dates genuinely differ near midnight, so a
// UTC-vs-local bucketing mistake shows up as a real mismatch instead of
// coincidentally passing in a UTC CI environment.
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = "Africa/Lagos";

/**
 * Integration-level RECONCILIATION coverage for the rolled-up financial
 * figures (docs/KNOWN_BUGS.md, "Process / methodology gaps"): every existing
 * test asserts one query's output against hand-written expected numbers, so
 * nothing cross-checks a report's aggregate against an independently computed
 * sum over the same underlying rows.
 *
 * The bugs in this class (date-range boundary off-by-one, UTC-vs-local
 * bucketing, cross-store leakage, join fan-out double counting) all come from
 * combining rows ACROSS date/store boundaries, which a single-function unit
 * test can't see. So each test here:
 *   (a) calls the real report/dashboard function for a date range + store, and
 *   (b) recomputes the same figure from the raw tables through a deliberately
 *       DIFFERENT aggregation path - rows pulled out with SELECT * and summed
 *       in JS, bucketed with JS Date arithmetic (epoch-ms comparisons and
 *       local getFullYear()/getMonth()) rather than SQLite string comparisons
 *       and strftime(..., 'localtime').
 * and asserts the two agree.
 *
 * The fixture is deliberately adversarial: multi-day, two stores, sales
 * placed on both sides of the local-midnight range boundaries, a sale whose
 * UTC month differs from its local month, multi-line sales (join fan-out),
 * soft-deleted rows, and a stock batch attributed to another store.
 */

const STORE_A = "store-a";
const STORE_B = "store-b";

/** Local (Africa/Lagos) 2026-03-02 00:00 .. 2026-03-04 23:59:59.999, as the
 * UTC ISO strings toQueryRange() would hand the report queries. */
const RANGE_FROM = "2026-03-01T23:00:00.000Z";
const RANGE_TO = "2026-03-04T22:59:59.999Z";

interface RawSale {
  id: string;
  store_id: string | null;
  transaction_date: string;
  total_amount: number;
  tax_amount?: number;
  _deleted: number | null;
}
interface RawSaleItem {
  id: string;
  sale_id: string;
  quantity: number;
  cost_price: number;
  total_price: number;
  _deleted: number | null;
}
interface RawReturn {
  id: string;
  sale_id: string;
  store_id: string | null;
  created_at: string;
  total_refunded: number;
  _deleted: number | null;
}
interface RawReturnItem {
  id: string;
  return_id: string;
  product_id: string;
  quantity: number;
  _deleted: number | null;
}
interface RawBatch {
  id: string;
  product_id: string;
  store_id: string | null;
  quantity: number;
  cost_price: number | null;
  _deleted: number | null;
}

describe("report/dashboard aggregate reconciliation against independent raw sums", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let reports: typeof import("@/lib/db/queries/reports");
  let inventory: typeof import("@/lib/db/queries/inventory");

  /** Pulls whole rows out and hands them back as plain objects - the
   * independent path never asks SQLite to aggregate or bucket anything. */
  function rawRows<T>(sql: string): T[] {
    const stmt = db.prepare(sql);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as unknown as T);
    stmt.free();
    return out;
  }

  const live = (r: { _deleted: number | null }) => !r._deleted;

  /** Independent in-range test: epoch-millisecond comparison of real Date
   * objects, not SQLite's lexicographic string compare on ISO text. */
  const inRange = (ts: string, from = RANGE_FROM, to = RANGE_TO) => {
    const t = new Date(ts).getTime();
    return t >= new Date(from).getTime() && t <= new Date(to).getTime();
  };

  /** Independent local-month bucket: JS local date parts under TZ=Africa/
   * Lagos, not strftime('%Y-%m', ..., 'localtime'). */
  const localMonth = (ts: string) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  /** The report's numbers come back already rounded to 2dp (toFixed(2)), so
   * an independently computed expectation with a repeating decimal in it
   * (a quantity-weighted average cost) has to be rounded the same way. */
  const round2 = (m: Map<string, number>) =>
    new Map([...m].map(([k, v]) => [k, Number(v.toFixed(2))]));

  /** Independent returned-COGS per local month of the return's created_at:
   * every live in-range store-A return's items valued at the quantity-
   * weighted sale-time cost for that (sale_id, product_id). */
  const returnedCogsByMonth = () => {
    const saleItems = rawRows<RawSaleItem & { sale_id: string; product_id: string }>(
      `SELECT * FROM sale_items`,
    );
    const avgCost = (saleId: string, productId: string) => {
      const rows = saleItems.filter((i) => i.sale_id === saleId && i.product_id === productId);
      const qty = rows.reduce((a, i) => a + i.quantity, 0);
      if (!qty) return 0;
      return rows.reduce((a, i) => a + i.cost_price * i.quantity, 0) / qty;
    };
    const items = rawRows<RawReturnItem>(`SELECT * FROM return_items`);
    const out = new Map<string, number>();
    for (const r of rawRows<RawReturn>(`SELECT * FROM returns`)) {
      if (!live(r) || r.store_id !== STORE_A || !inRange(r.created_at)) continue;
      const k = localMonth(r.created_at);
      for (const i of items.filter((x) => x.return_id === r.id && live(x))) {
        out.set(k, (out.get(k) ?? 0) + i.quantity * avgCost(r.sale_id, i.product_id));
      }
    }
    return out;
  };

  /** Independent local calendar day, same idea. */
  const localDay = (ts: string) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    reports = await import("@/lib/db/queries/reports");
    inventory = await import("@/lib/db/queries/inventory");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);

    seed();
    core.setActiveStoreId(STORE_A);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    core.setActiveStoreId(null);
    process.env.TZ = ORIGINAL_TZ;
  });

  function seed() {
    db.run(
      `INSERT INTO users (id, first_name, last_name, _deleted) VALUES ('u1', 'Ada', 'Cashier', 0)`,
    );
    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted) VALUES ('cat1', 'Analgesics', '${STORE_A}', 0)`,
    );
    db.run(
      `INSERT INTO products (id, name, category_id, selling_price, store_id, created_at, _deleted) VALUES
        ('p1', 'Paracetamol', 'cat1', 500, '${STORE_A}', '2026-01-01T00:00:00.000Z', 0),
        ('p2', 'Amoxicillin', 'cat1', 1200, '${STORE_A}', '2026-01-01T00:00:00.000Z', 0),
        ('p3', 'Ibuprofen',  NULL,   800, '${STORE_B}', '2026-01-01T00:00:00.000Z', 0)`,
    );

    // Inventory: live store-a batches, a zero-quantity one, a soft-deleted
    // one, a store-b batch, and a store-b-attributed batch hanging off a
    // store-a product (the cross-store leak shape).
    db.run(
      `INSERT INTO stock_batches (id, product_id, store_id, quantity, cost_price, is_active, _deleted) VALUES
        ('b1', 'p1', '${STORE_A}', 40, 300, 1, 0),
        ('b2', 'p1', '${STORE_A}', 10, 320, 1, 0),
        ('b3', 'p2', '${STORE_A}',  6, 900, 1, 0),
        ('b4', 'p2', '${STORE_A}',  0, 880, 1, 0),
        ('b5', 'p1', '${STORE_A}', 25, 310, 1, 1),
        ('b6', 'p3', '${STORE_B}', 70, 500, 1, 0),
        ('b7', 'p1', '${STORE_B}', 99, 999, 1, 0)`,
    );

    // Sales. Timestamps are UTC; the local (UTC+1) day is noted per row.
    //   sA0  2026-02-28T23:30Z -> local 2026-03-01 00:30  (UTC month Feb,
    //                                                      LOCAL month Mar)
    //   sA1  2026-03-01T22:30Z -> local 2026-03-01 23:30  (before range)
    //   sA2  2026-03-01T23:30Z -> local 2026-03-02 00:30  (range's first ms+)
    //   sA3  2026-03-03T12:00Z -> local 2026-03-03 13:00  (mid range)
    //   sA4  2026-03-04T22:30Z -> local 2026-03-04 23:30  (range's last day)
    //   sA5  2026-03-04T23:30Z -> local 2026-03-05 00:30  (after range)
    //   sAX  soft-deleted, mid range
    //   sB1  store-b, mid range
    db.run(
      `INSERT INTO sales (id, transaction_number, user_id, subtotal, tax_amount, discount_total, total_amount, payment_method, transaction_date, created_at, store_id, _deleted) VALUES
        ('sA0', 'TXN-A0', 'u1', 4000,  200, 0, 4200, 'cash',   '2026-02-28T23:30:00.000Z', '2026-02-28T23:30:00.000Z', '${STORE_A}', 0),
        ('sA1', 'TXN-A1', 'u1', 1000,   50, 0, 1050, 'cash',   '2026-03-01T22:30:00.000Z', '2026-03-01T22:30:00.000Z', '${STORE_A}', 0),
        ('sA2', 'TXN-A2', 'u1', 2500,  125, 0, 2625, 'card',   '2026-03-01T23:30:00.000Z', '2026-03-01T23:30:00.000Z', '${STORE_A}', 0),
        ('sA3', 'TXN-A3', 'u1', 7300,  365, 0, 7665, 'cash',   '2026-03-03T12:00:00.000Z', '2026-03-03T12:00:00.000Z', '${STORE_A}', 0),
        ('sA4', 'TXN-A4', 'u1', 1800,   90, 0, 1890, 'credit', '2026-03-04T22:30:00.000Z', '2026-03-04T22:30:00.000Z', '${STORE_A}', 0),
        ('sA5', 'TXN-A5', 'u1',  900,   45, 0,  945, 'cash',   '2026-03-04T23:30:00.000Z', '2026-03-04T23:30:00.000Z', '${STORE_A}', 0),
        ('sAX', 'TXN-AX', 'u1', 5000,  250, 0, 5250, 'cash',   '2026-03-03T09:00:00.000Z', '2026-03-03T09:00:00.000Z', '${STORE_A}', 1),
        ('sB1', 'TXN-B1', 'u1', 6000,  300, 0, 6300, 'cash',   '2026-03-03T12:00:00.000Z', '2026-03-03T12:00:00.000Z', '${STORE_B}', 0)`,
    );

    // sA3 is deliberately a 3-line sale (two lines for the same product) so a
    // revenue query that joins sale_items would fan its total_amount out.
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, _deleted) VALUES
        ('iA0a', 'sA0', 'p1', 8, 500, 300, 4000, 0),
        ('iA1a', 'sA1', 'p1', 2, 500, 300, 1000, 0),
        ('iA2a', 'sA2', 'p1', 2, 500, 300, 1000, 0),
        ('iA2b', 'sA2', 'p2', 1, 1500, 900, 1500, 0),
        ('iA3a', 'sA3', 'p1', 4, 500, 300, 2000, 0),
        ('iA3b', 'sA3', 'p1', 2, 400, 320, 800, 0),
        ('iA3c', 'sA3', 'p2', 3, 1500, 900, 4500, 0),
        ('iA4a', 'sA4', 'p2', 1, 1800, 950, 1800, 0),
        ('iA5a', 'sA5', 'p1', 1, 900, 300, 900, 0),
        ('iAXa', 'sAX', 'p1', 9, 500, 300, 5000, 0),
        ('iB1a', 'sB1', 'p3', 6, 1000, 500, 6000, 0)`,
    );

    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, store_id, _deleted) VALUES
        ('r1', 'sA3', 'u1', 800, '2026-03-03T15:00:00.000Z', '${STORE_A}', 0)`,
    );
    db.run(
      `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal, _deleted) VALUES
        ('ri1', 'r1', 'p1', 2, 400, 800, 0)`,
    );

    db.run(
      `INSERT INTO expenses (id, category, description, amount, date, store_id, _deleted) VALUES
        ('e1', 'rent', 'March rent',  15000, '2026-03-02', '${STORE_A}', 0),
        ('e2', 'power', 'Diesel',      3000, '2026-03-04', '${STORE_A}', 0),
        ('e3', 'power', 'Other store', 9000, '2026-03-03', '${STORE_B}', 0)`,
    );
  }

  // ---------------------------------------------------------------- revenue

  it("fetchProfitLossReportData's per-month Revenue reconciles with a raw-row JS sum bucketed by local month", async () => {
    const rows = await reports.fetchProfitLossReportData(RANGE_FROM, RANGE_TO);

    // Independent path: whole sales rows, filtered and bucketed in JS.
    // Revenue excludes tax_amount - VAT/tax collected on the government's
    // behalf is a liability, not revenue (see docs/KNOWN_BUGS.md's tax/VAT
    // finding and useBIData's netSales, which this report is aligned with) -
    // and is NET OF REFUNDS, the same as every other revenue surface
    // (useBIData's netSales, getCurrentMonthRevenue). Refunds are bucketed by
    // the return's own created_at, the basis the report windows them on.
    //
    // total_refunded is VAT-INCLUSIVE (calculateProportionalRefund bakes the
    // refunded line's tax share into it), while this revenue figure is
    // ex-VAT - so only the ex-VAT share of a refund nets out here:
    // refund * (sale.total_amount - sale.tax_amount) / sale.total_amount.
    // Subtracting the raw refund would over-subtract by the refunded VAT
    // (the same bug already fixed in the Daily Close report).
    const salesById = new Map(rawRows<RawSale>(`SELECT * FROM sales`).map((s) => [s.id, s]));
    const expected = new Map<string, number>();
    for (const s of rawRows<RawSale>(`SELECT * FROM sales`)) {
      if (!live(s) || s.store_id !== STORE_A || !inRange(s.transaction_date)) continue;
      const k = localMonth(s.transaction_date);
      expected.set(k, (expected.get(k) ?? 0) + (s.total_amount - (s.tax_amount || 0)));
    }
    for (const r of rawRows<RawReturn>(`SELECT * FROM returns`)) {
      if (!live(r) || r.store_id !== STORE_A || !inRange(r.created_at)) continue;
      const k = localMonth(r.created_at);
      const sale = salesById.get(r.sale_id);
      const exVatRefund =
        sale && sale.total_amount
          ? (r.total_refunded * (sale.total_amount - (sale.tax_amount || 0))) / sale.total_amount
          : r.total_refunded;
      expected.set(k, (expected.get(k) ?? 0) - exVatRefund);
    }

    const actual = new Map(rows.map((r) => [String(r["Month"]), Number(r["Revenue"])]));
    expect(actual).toEqual(round2(expected));
    // Guard that the fixture actually exercised the range boundaries: sA2
    // (first ms of the range, local) and sA4 (last local day) are in, sA1 and
    // sA5 (just outside, on either end) are not, sAX is deleted, sB1 is the
    // other store. Tax-excluded (subtotal) amounts 2500 + 7300 + 1800, less
    // r1's 800 refund against sA3 netted down to its ex-VAT share
    // (800 * 7300/7665 = 16000/21).
    expect([...expected.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(
      2500 + 7300 + 1800 - 16000 / 21,
      6,
    );
  });

  it("fetchSalesReportData's row-level totals reconcile with the same range's raw sales rows (independent of the report's own SQL filtering)", async () => {
    const rows = await reports.fetchSalesReportData(RANGE_FROM, RANGE_TO);

    const expectedIds = rawRows<RawSale>(`SELECT * FROM sales`)
      .filter((s) => live(s) && s.store_id === STORE_A && inRange(s.transaction_date))
      .map((s) => s.id)
      .sort();
    const expectedTotal = rawRows<RawSale>(`SELECT * FROM sales`)
      .filter((s) => live(s) && s.store_id === STORE_A && inRange(s.transaction_date))
      .reduce((a, s) => a + s.total_amount, 0);

    expect(rows).toHaveLength(expectedIds.length);
    expect(rows.reduce((a, r) => a + Number(r["Total"]), 0)).toBe(expectedTotal);
  });

  it("getBIMetrics's revenue reconciles with a raw-row JS sum over the same open-ended window", async () => {
    const metrics = await reports.getBIMetrics(RANGE_FROM, "2026-01-01T00:00:00.000Z");
    const now = new Date().toISOString();

    const expected = rawRows<RawSale>(`SELECT * FROM sales`)
      .filter((s) => live(s) && s.store_id === STORE_A && inRange(s.transaction_date, RANGE_FROM, now))
      .reduce((a, s) => a + s.total_amount, 0);

    expect(metrics.revenueData[0].total).toBe(expected);
    // The window runs from the range start to "now", so it must include the
    // sale just past the closed range's end (sA5) and exclude the one before
    // its start (sA1) - i.e. this is a different number than the test above.
    expect(expected).toBe(2625 + 7665 + 1890 + 945);
  });

  it("getDashboardOverviewData's salesToday reconciles with a raw-row JS sum bucketed by local calendar day", async () => {
    // "Now" inside the fixture: 2026-03-03T18:00Z -> local Mar 3 19:00.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T18:00:00.000Z"));

    const { salesToday } = await reports.getDashboardOverviewData();

    const today = localDay(new Date().toISOString());
    const todays = rawRows<RawSale>(`SELECT * FROM sales`).filter(
      (s) => live(s) && s.store_id === STORE_A && localDay(s.transaction_date) === today,
    );

    expect(salesToday.total ?? 0).toBe(todays.reduce((a, s) => a + s.total_amount, 0));
    expect(salesToday.count ?? 0).toBe(todays.length);
  });

  it("getAdvancedMonthlySalesData's monthly revenue reconciles with a raw-row JS sum - including a sale whose UTC month differs from its local month", async () => {
    const { rawMonthlyData } = await reports.getAdvancedMonthlySalesData("2026-02-01T00:00:00.000Z");

    const expected = new Map<string, number>();
    for (const s of rawRows<RawSale>(`SELECT * FROM sales`)) {
      if (!live(s) || s.store_id !== STORE_A) continue;
      if (new Date(s.transaction_date).getTime() < new Date("2026-02-01T00:00:00.000Z").getTime()) continue;
      const k = localMonth(s.transaction_date);
      expected.set(k, (expected.get(k) ?? 0) + s.total_amount);
    }

    const actual = new Map(rawMonthlyData.map((r) => [r.month, r.revenue]));
    expect(actual).toEqual(expected);
    // sA0 is 2026-02-28T23:30Z: UTC month February, local month March. If the
    // bucketing dropped 'localtime' on either side it would land in 2026-02.
    expect(actual.get("2026-02")).toBeUndefined();
    expect(actual.get("2026-03")).toBe(4200 + 1050 + 2625 + 7665 + 1890 + 945);
  });

  // ------------------------------------------------------------------- COGS

  it("fetchProfitLossReportData's per-month COGS reconciles with a raw sale_items JS sum (no join fan-out, deleted/other-store sales excluded)", async () => {
    const rows = await reports.fetchProfitLossReportData(RANGE_FROM, RANGE_TO);

    const salesById = new Map(
      rawRows<RawSale>(`SELECT * FROM sales`).map((s) => [s.id, s]),
    );
    const expected = new Map<string, number>();
    for (const i of rawRows<RawSaleItem>(`SELECT * FROM sale_items`)) {
      const s = salesById.get(i.sale_id);
      if (!s || !live(s) || s.store_id !== STORE_A || !inRange(s.transaction_date)) continue;
      const k = localMonth(s.transaction_date);
      expected.set(k, (expected.get(k) ?? 0) + i.cost_price * i.quantity);
    }
    // ...less the cost of what came back, bucketed by the return's created_at
    // (the report nets returned COGS out the same way useBIData's totalCogs
    // does), valued at the quantity-weighted sale-time cost.
    for (const [month, cost] of returnedCogsByMonth()) {
      expected.set(month, (expected.get(month) ?? 0) - cost);
    }

    const actual = new Map(rows.map((r) => [String(r["Month"]), Number(r["COGS"])]));
    expect(actual).toEqual(round2(expected));
    // sA2 (300*2 + 900*1) + sA3 (300*4 + 320*2 + 900*3) + sA4 (950*1), less
    // r1's 2 returned p1 units at sA3's weighted cost (4*300 + 2*320)/6.
    expect(actual.get("2026-03")).toBe(
      Number((1500 + 4540 + 950 - (2 * 1840) / 6).toFixed(2)),
    );
  });

  it("getBIMetrics's COGS reconciles with a raw sale_items JS sum over the same open-ended window", async () => {
    const metrics = await reports.getBIMetrics(RANGE_FROM, "2026-01-01T00:00:00.000Z");
    const now = new Date().toISOString();

    const salesById = new Map(
      rawRows<RawSale>(`SELECT * FROM sales`).map((s) => [s.id, s]),
    );
    const expected = rawRows<RawSaleItem>(`SELECT * FROM sale_items`).reduce((acc, i) => {
      const s = salesById.get(i.sale_id);
      if (!s || !live(s) || s.store_id !== STORE_A || !inRange(s.transaction_date, RANGE_FROM, now)) return acc;
      return acc + i.cost_price * i.quantity;
    }, 0);

    expect(metrics.cogsData[0].total).toBe(expected);
  });

  it("gross profit from fetchProfitLossReportData reconciles with revenue-minus-COGS computed entirely from raw rows", async () => {
    const rows = await reports.fetchProfitLossReportData(RANGE_FROM, RANGE_TO);

    const salesInRange = rawRows<RawSale>(`SELECT * FROM sales`).filter(
      (s) => live(s) && s.store_id === STORE_A && inRange(s.transaction_date),
    );
    const idsInRange = new Set(salesInRange.map((s) => s.id));
    const salesById = new Map(rawRows<RawSale>(`SELECT * FROM sales`).map((s) => [s.id, s]));
    // Both sides net of returns, matching the report (and useBIData): refunds
    // out of revenue, returned items' sale-time cost out of COGS. Refunds are
    // netted at their EX-VAT share only - total_refunded is VAT-inclusive,
    // see the matching comment on the Revenue reconciliation test above.
    const rawRefunds = rawRows<RawReturn>(`SELECT * FROM returns`)
      .filter((r) => live(r) && r.store_id === STORE_A && inRange(r.created_at))
      .reduce((a, r) => {
        const sale = salesById.get(r.sale_id);
        const exVat =
          sale && sale.total_amount
            ? (r.total_refunded * (sale.total_amount - (sale.tax_amount || 0))) / sale.total_amount
            : r.total_refunded;
        return a + exVat;
      }, 0);
    const rawRevenue =
      salesInRange.reduce((a, s) => a + (s.total_amount - (s.tax_amount || 0)), 0) - rawRefunds;
    const rawReturnedCogs = [...returnedCogsByMonth().values()].reduce((a, b) => a + b, 0);
    const rawCogs =
      rawRows<RawSaleItem>(`SELECT * FROM sale_items`)
        .filter((i) => idsInRange.has(i.sale_id))
        .reduce((a, i) => a + i.cost_price * i.quantity, 0) - rawReturnedCogs;

    const reportGross = rows.reduce((a, r) => a + Number(r["Gross Profit"]), 0);
    // 10838.10 revenue (2500 + 7300 + 1800 - r1's ex-VAT refund share
    // 800*7300/7665 = 16000/21 ~= 761.90) - 6376.67 COGS (6990 less r1's
    // 2 units at (4*300 + 2*320)/6 = 306.67 each).
    expect(reportGross).toBeCloseTo(rawRevenue - rawCogs, 2);
  });

  // ---------------------------------------------------- inventory valuation

  it("getStockBatchStats's total_stock_batch_value reconciles with a raw stock_batches JS sum for the active store", async () => {
    const stats = await inventory.getStockBatchStats();

    const expected = rawRows<RawBatch>(`SELECT * FROM stock_batches`)
      .filter((b) => live(b) && b.store_id === STORE_A)
      .reduce((a, b) => a + b.quantity * (b.cost_price ?? 0), 0);

    expect(stats.total_stock_batch_value).toBe(expected);
    // b1 40*300 + b2 10*320 + b3 6*900 + b4 0*880; b5 is soft-deleted, b6 is
    // store-b's own product, b7 is a store-b batch hanging off a store-a
    // product.
    expect(expected).toBe(12000 + 3200 + 5400);
  });

  it("getBIMetrics's stock_batchValueData, fetchStockBatchReportData's Stock Value, and getStockBatchStats all agree with the same raw sum", async () => {
    const expected = rawRows<RawBatch>(`SELECT * FROM stock_batches`)
      .filter((b) => live(b) && b.store_id === STORE_A)
      .reduce((a, b) => a + b.quantity * (b.cost_price ?? 0), 0);

    const metrics = await reports.getBIMetrics(RANGE_FROM, "2026-01-01T00:00:00.000Z");
    expect(metrics.stock_batchValueData[0].value).toBe(expected);

    const batchRows = await reports.fetchStockBatchReportData();
    expect(batchRows.reduce((a, r) => a + Number(r["Stock Value"] ?? 0), 0)).toBe(expected);

    const stats = await inventory.getStockBatchStats();
    expect(stats.total_stock_batch_value).toBe(expected);
  });

  it("getStockBatchStats's per-product stock quantities reconcile with a raw stock_batches JS sum for the active store", async () => {
    const stats = await inventory.getStockBatchStats();

    const batches = rawRows<RawBatch>(`SELECT * FROM stock_batches`).filter(
      (b) => live(b) && b.store_id === STORE_A,
    );
    const qtyByProduct = new Map<string, number>();
    for (const b of batches) qtyByProduct.set(b.product_id, (qtyByProduct.get(b.product_id) ?? 0) + b.quantity);

    // Store-a has p1 (50 units) and p2 (6 units) in stock; the row count
    // itself must not pick up store-b's product.
    expect(stats.total_products).toBe(2);
    expect(qtyByProduct.get("p1")).toBe(50);
    expect(qtyByProduct.get("p2")).toBe(6);
    expect([...qtyByProduct.values()].reduce((a, b) => a + b, 0)).toBe(56);
  });
});

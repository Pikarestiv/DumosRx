import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import initSqlJs, { type Database } from "sql.js";

// Audit follow-up to the dashboard "Customer Retention" -> "Repeat Purchase
// Rate" relabel (lib/hooks/use-bi-data.ts): the Customers page's
// "Retention & Engagement" card used the exact same construction —
// getCustomerRetentionMetrics() in lib/db/queries/customers.ts counts
// customers with >1 sale *inside a single trailing 30-day window* over
// customers with >=1 sale in that window. That is a repeat-purchase rate, not
// retention of a prior cohort or of the store's customer base. There is no
// unambiguous cohort/baseline definition available in this app, so the
// calculation is intentionally unchanged and only the labels were corrected.
//
// "Avg Visits/Mo" had a second, independent problem: the average is taken over
// the customers who *bought in the window*, not over all registered customers
// and not store-wide, so it is now "Avg Visits/Customer" under a card titled
// "Engagement (Last 30 Days)".
//
// These tests pin both the corrected labels (source inspection — no component
// render harness exists in this repo, see
// profit-loss-tab-currency-formatting.test.ts for the same pattern) and the
// numerator/denominator the labels now promise.

describe("Customers page engagement card labels", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../components/customers/overview-tab.tsx"),
    "utf-8",
  );

  it('labels the repeat-purchase-within-window metric "Repeat Purchase Rate", matching the dashboard tile', () => {
    expect(source).toContain("Repeat Purchase Rate");
    // The old label claimed retention, which nothing here computes.
    expect(source).not.toMatch(/>\s*Retention Rate\s*</);
    expect(source).not.toContain("Retention & Engagement");
  });

  it('labels the per-buying-customer visit average "Avg Visits/Customer" and scopes the card to the 30-day window', () => {
    expect(source).toContain("Avg Visits/Customer");
    expect(source).not.toContain("Avg Visits/Mo");
    expect(source).toContain("Engagement (Last 30 Days)");
  });
});

describe("getCustomerRetentionMetrics population", () => {
  let core: typeof import("@/lib/db/core");
  let getCustomerRetentionMetrics: typeof import("@/lib/db/queries/customers").getCustomerRetentionMetrics;
  let db: Database;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const customers = await import("@/lib/db/queries/customers");
    getCustomerRetentionMetrics = customers.getCustomerRetentionMetrics;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE sales (
        id TEXT PRIMARY KEY, customer_id TEXT, total_amount REAL, transaction_date TEXT,
        _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE returns (
        id TEXT PRIMARY KEY, sale_id TEXT, total_refunded REAL, _deleted INTEGER DEFAULT 0
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM returns;`);
    core.setActiveStoreId(null);
  });

  const insert = (id: string, customerId: string | null, daysAgo: number, amount = 100) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    db.run(
      `INSERT INTO sales (id, customer_id, total_amount, transaction_date) VALUES (?, ?, ?, ?)`,
      [id, customerId, amount, d.toISOString()],
    );
  };

  it("computes the repeat-purchase rate as >1-sale buyers over all in-window buyers", async () => {
    insert("s1", "c1", 1);
    insert("s2", "c1", 2); // c1 bought twice -> repeat
    insert("s3", "c2", 3); // c2 bought once
    insert("s4", "c3", 4); // c3 bought once

    const { retentionRate } = await getCustomerRetentionMetrics();

    // 1 repeat buyer / 3 in-window buyers.
    expect(retentionRate).toBeCloseTo((1 / 3) * 100, 6);
  });

  it("averages visits over the customers who bought in the window, not over every customer with sales ever", async () => {
    insert("s1", "c1", 1);
    insert("s2", "c1", 2);
    insert("s3", "c2", 3);
    // c3 last bought 90 days ago: outside the window, so it must not appear in
    // either the visit count or the customer count.
    insert("s4", "c3", 90);

    const { avgVisits, retentionRate } = await getCustomerRetentionMetrics();

    // 3 in-window visits / 2 in-window buyers.
    expect(avgVisits).toBeCloseTo(1.5, 6);
    expect(retentionRate).toBeCloseTo(50, 6);
  });

  it("ignores anonymous walk-in sales on both sides of every ratio", async () => {
    insert("s1", "c1", 1);
    insert("s2", "c1", 2);
    insert("s3", null, 1, 5000);
    insert("s4", null, 2, 5000);

    const { retentionRate, avgVisits, avgTransactionValue } =
      await getCustomerRetentionMetrics();

    expect(retentionRate).toBe(100);
    expect(avgVisits).toBe(2);
    // Only c1's two 100-unit sales count.
    expect(avgTransactionValue).toBe(100);
  });

  it("returns zeroes rather than NaN when nobody bought in the window", async () => {
    insert("s1", "c1", 90);

    const metrics = await getCustomerRetentionMetrics();

    expect(metrics.retentionRate).toBe(0);
    expect(metrics.avgVisits).toBe(0);
    expect(metrics.avgTransactionValue).toBe(0);
  });
});

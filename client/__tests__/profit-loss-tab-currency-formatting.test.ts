import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression test for a formatting inconsistency found while smoke-testing
// Reports > Analytics & Insights > Profit & Loss: the BIKeyMetrics cards at
// the top of the page (components/analytics/bi-key-metrics.tsx) render "Net
// Profit" via formatMetricCurrency() (rounded to a whole NGN unit, e.g.
// "₦1,420"), but the "Financial Performance Statement" panel just below it
// (components/analytics/profit-loss-tab.tsx) rendered the *same* aggregate
// figures — Gross Sales, Net Sales, COGS, Gross Profit, Total Operational
// Expenses, and Final Net Income (== the same netProfit value) — via
// formatCurrency(), which keeps kobo-level decimals (e.g. "₦1,420.25").
// Live-verified: on the same page, in the same render, "Net Profit" showed
// "₦1,420" in one card and "₦1,420.25" a few rows below it for the literal
// same number.
//
// This test parses the component source (no component-rendering harness
// exists in this repo yet — see dashboard-action-center-routes.test.ts for
// the same source-inspection pattern) and asserts every aggregate-total
// currency render in the P&L statement uses formatMetricCurrency, matching
// the BIKeyMetrics cards it duplicates.

describe('Profit & Loss tab currency formatting', () => {
  it('renders every aggregate total via formatMetricCurrency, not formatCurrency', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/analytics/profit-loss-tab.tsx'),
      'utf-8',
    );

    // The bug: importing/calling the un-rounded formatCurrency for these
    // aggregate figures instead of formatMetricCurrency.
    expect(source).not.toMatch(/\bformatCurrency\(/);

    // The fix: formatMetricCurrency is imported and used for each of the
    // six aggregate lines in the Financial Performance Statement +
    // Final Net Income figure.
    expect(source).toMatch(/import \{[^}]*formatMetricCurrency[^}]*\} from "@\/lib\/utils"/);
    const usageCount = (source.match(/formatMetricCurrency\(/g) || []).length;
    expect(usageCount).toBeGreaterThanOrEqual(7);
  });
});

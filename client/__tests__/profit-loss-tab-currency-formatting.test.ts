import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression test for a formatting inconsistency found while smoke-testing Reports > Analytics & Insights > Profit & Loss:
// Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-profit-loss-tab-currency-formatting-test-ts-L5

describe('Profit & Loss tab currency formatting', () => {
  it('renders every aggregate total via formatMetricCurrency, not formatCurrency', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../components/analytics/profit-loss-tab.tsx'),
      'utf-8',
    );

    // The bug: importing/calling the un-rounded formatCurrency for these
    // aggregate figures instead of formatMetricCurrency.
    expect(source).not.toMatch(/\bformatCurrency\(/);

    // The fix: formatMetricCurrency is imported and used for each of the six aggregate lines in the Financial Performance Stat…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-profit-loss-tab-currency-formatting-test-ts-L35
    expect(source).toMatch(/import \{[^}]*formatMetricCurrency[^}]*\} from "@\/lib\/utils"/);
    const usageCount = (source.match(/formatMetricCurrency\(/g) || []).length;
    expect(usageCount).toBeGreaterThanOrEqual(7);
  });
});

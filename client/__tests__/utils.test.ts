import { describe, it, expect } from 'vitest';
import { formatCurrency, formatMetricCurrency, getUserInitials, getCurrencySymbol } from '@/lib/utils';

describe('Utility Functions', () => {
  describe('formatCurrency', () => {
    it('formats NGN correctly', () => {
      const result = formatCurrency(1500, 'NGN');
      // Replace non-breaking spaces before checking to avoid issues across environments
      expect(result.replace(/\u00a0/g, ' ')).toMatch(/1,500/);
    });

    it('formats USD correctly', () => {
      const result = formatCurrency(50.5, 'USD');
      expect(result.replace(/\u00a0/g, ' ')).toMatch(/50.5/);
    });
  });

  describe('formatMetricCurrency', () => {
    // Used by the dashboard's "Today's Sales" and "Inventory Value" stat
    // cards (components/dashboard/dashboard-overview.tsx) so headline figures
    // read as clean whole numbers instead of exact-to-the-kobo totals.
    it('rounds NGN to whole units even with kobo-level cents', () => {
      const result = formatMetricCurrency(1929051.37, 'NGN');
      expect(result.replace(/\u00a0/g, ' ')).toMatch(/1,929,051/);
      expect(result).not.toMatch(/\./);
    });

    it('still rounds NGN when the amount is already a whole number', () => {
      const result = formatMetricCurrency(500, 'NGN');
      expect(result.replace(/\u00a0/g, ' ')).toMatch(/500/);
      expect(result).not.toMatch(/\./);
    });

    it('keeps sub-unit precision for a non-Naira currency (USD)', () => {
      const result = formatMetricCurrency(50.5, 'USD');
      expect(result.replace(/\u00a0/g, ' ')).toMatch(/50.5/);
    });

    it('defaults to NGN (rounded) when no currency code is given', () => {
      const result = formatMetricCurrency(1234.56);
      expect(result).not.toMatch(/\./);
    });

    // Task 8 (Reports) gap-fill: the pre-existing tests above never covered
    // negative amounts, zero, or large values, even though this function is
    // used for headline metric cards across Dashboard/Expenses/POS/Reports/
    // Analytics that can plausibly see all three (a refund-heavy day's net
    // total going negative, a fresh store's ₦0 stat card, a large inventory
    // valuation figure).
    it('rounds a negative NGN amount to a whole unit and keeps the minus sign', () => {
      const result = formatMetricCurrency(-1929051.37, 'NGN');
      const normalized = result.replace(/ /g, ' ');
      expect(normalized).toMatch(/-/);
      expect(normalized).toMatch(/1,929,051/);
      expect(result).not.toMatch(/\./);
    });

    it('formats zero as a plain whole-unit amount', () => {
      const result = formatMetricCurrency(0, 'NGN');
      const normalized = result.replace(/ /g, ' ');
      expect(normalized).toMatch(/0/);
      expect(result).not.toMatch(/\./);
    });

    it('rounds a large NGN amount (millions) to a whole unit with grouping', () => {
      const result = formatMetricCurrency(19_320_845.99, 'NGN');
      const normalized = result.replace(/ /g, ' ');
      expect(normalized).toMatch(/19,320,846/);
      expect(result).not.toMatch(/\./);
    });

    it('keeps sub-unit precision for a negative non-NGN amount', () => {
      // noDecimalCurrencies only special-cases NGN — a non-Naira store's
      // negative figure should still show its own decimal precision.
      const result = formatMetricCurrency(-50.5, 'USD');
      const normalized = result.replace(/ /g, ' ');
      expect(normalized).toMatch(/-/);
      expect(normalized).toMatch(/50.5/);
    });
  });

  describe('getCurrencySymbol', () => {
    // Regression: several chart/metric components hardcoded "\u20a6" instead of
    // deriving it from the store's actual configured currency (Settings has
    // a real Currency selector), so a non-Naira store's analytics dashboard
    // silently showed the wrong currency symbol on every figure.
    it('returns the Naira symbol by default', () => {
      expect(getCurrencySymbol()).toBe('\u20a6');
    });

    it('returns the dollar symbol for USD', () => {
      // "US$" not "$", since the en-NG locale disambiguates from Naira.
      expect(getCurrencySymbol('USD')).toBe('US$');
    });

    it('returns the pound symbol for GBP', () => {
      expect(getCurrencySymbol('GBP')).toBe('\u00a3');
    });
  });

  describe('getUserInitials', () => {
    it('extracts initials from first and last name', () => {
      expect(getUserInitials('John', 'Doe')).toBe('JD');
    });

    it('handles missing last name', () => {
      expect(getUserInitials('Alice', null)).toBe('A');
    });

    it('handles missing first name', () => {
      expect(getUserInitials(undefined, 'Smith')).toBe('S');
    });

    it('returns "U" when both names are missing', () => {
      expect(getUserInitials(undefined, undefined)).toBe('U');
      expect(getUserInitials(null, null)).toBe('U');
      expect(getUserInitials('', '')).toBe('U');
    });
  });
});

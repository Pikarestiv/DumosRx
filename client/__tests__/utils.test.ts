import { describe, it, expect } from 'vitest';
import { formatCurrency, getUserInitials, getCurrencySymbol } from '@/lib/utils';

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

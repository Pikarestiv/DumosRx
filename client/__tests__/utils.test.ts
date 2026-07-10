import { describe, it, expect } from 'vitest';
import { formatCurrency, getUserInitials } from '@/lib/utils';

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

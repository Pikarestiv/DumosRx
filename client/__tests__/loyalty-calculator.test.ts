import { describe, it, expect } from 'vitest';
import { calculateEarnedPoints, calculateRedemptionValue, LOYALTY_RULES } from '@/lib/utils/loyalty-calculator';

describe('Loyalty Calculator', () => {
  describe('calculateEarnedPoints', () => {
    it('calculates earned points correctly with default rate', () => {
      // Default rate is 0.01 (1 point per 100 Naira)
      expect(calculateEarnedPoints(1000)).toBe(10);
      expect(calculateEarnedPoints(1050)).toBe(10); // Floors the result
      expect(calculateEarnedPoints(50)).toBe(0);
    });

    it('calculates earned points with custom rate', () => {
      expect(calculateEarnedPoints(1000, 0.05)).toBe(50);
    });
  });

  describe('calculateRedemptionValue', () => {
    it('calculates redemption value correctly with default rate', () => {
      // Default rate is 1 Naira per point
      expect(calculateRedemptionValue(150)).toBe(150);
    });

    it('calculates redemption value with custom rate', () => {
      expect(calculateRedemptionValue(100, 2)).toBe(200);
    });
  });

  describe('LOYALTY_RULES', () => {
    it('contains expected default rules', () => {
      expect(LOYALTY_RULES.MIN_REDEMPTION_POINTS).toBe(100);
      expect(LOYALTY_RULES.POINTS_EXPIRY_MONTHS).toBe(12);
    });
  });
});

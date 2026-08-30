import { describe, it, expect } from 'vitest';
import {
  calculateEarnedPoints,
  calculateRedemptionValue,
  calculateLoyaltyPointsAfterSale,
  calculateReturnPointsAdjustment,
  LOYALTY_RULES,
} from '@/lib/utils/loyalty-calculator';

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

  describe('calculateLoyaltyPointsAfterSale', () => {
    it('adds earned points with nothing redeemed', () => {
      expect(calculateLoyaltyPointsAfterSale(100, 10, 0)).toBe(110);
    });

    it('subtracts redeemed points with nothing earned', () => {
      expect(calculateLoyaltyPointsAfterSale(500, 0, 200)).toBe(300);
    });

    it('combines earning and redeeming in the same sale', () => {
      expect(calculateLoyaltyPointsAfterSale(500, 10, 200)).toBe(310);
    });

    it('floors at 0 instead of going negative', () => {
      expect(calculateLoyaltyPointsAfterSale(100, 0, 500)).toBe(0);
    });
  });

  describe('calculateReturnPointsAdjustment', () => {
    it('claws back the full points earned on a full return', () => {
      expect(calculateReturnPointsAdjustment(50, 0, 1)).toEqual({ clawback: 50, refund: 0 });
    });

    it('refunds the full points redeemed on a full return', () => {
      expect(calculateReturnPointsAdjustment(0, 500, 1)).toEqual({ clawback: 0, refund: 500 });
    });

    it('prorates both by the returned items share on a partial return', () => {
      // Returned half the sale's items -> half the earn/redeem impact undone.
      expect(calculateReturnPointsAdjustment(50, 500, 0.5)).toEqual({ clawback: 25, refund: 250 });
    });

    it('floors fractional point results instead of rounding', () => {
      expect(calculateReturnPointsAdjustment(10, 10, 1 / 3)).toEqual({ clawback: 3, refund: 3 });
    });

    it('returns zero for both when nothing was earned or redeemed', () => {
      expect(calculateReturnPointsAdjustment(0, 0, 1)).toEqual({ clawback: 0, refund: 0 });
    });
  });

  describe('LOYALTY_RULES', () => {
    it('contains expected default rules', () => {
      expect(LOYALTY_RULES.MIN_REDEMPTION_POINTS).toBe(100);
      expect(LOYALTY_RULES.POINTS_EXPIRY_MONTHS).toBe(12);
    });
  });
});

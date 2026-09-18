import { describe, it, expect } from 'vitest';
import {
  calculateEarnedPoints,
  calculateRedemptionValue,
  calculateLoyaltyPointsAfterSale,
  calculateReturnPointsAdjustment,
  getApplicableTierMultiplier,
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

    it('applies a tier multiplier on top of the base rate', () => {
      // 1000 * 0.01 * 2x = 20
      expect(calculateEarnedPoints(1000, 0.01, 2)).toBe(20);
    });

    it('defaults the tier multiplier to 1x when omitted', () => {
      expect(calculateEarnedPoints(1000, 0.01)).toBe(10);
    });

    it('floors the multiplied result, not just the base points', () => {
      // 1000 * 0.01 * 1.5 = 15 exactly, but 1050 * 0.01 * 1.5 = 15.75 -> 15
      expect(calculateEarnedPoints(1050, 0.01, 1.5)).toBe(15);
    });
  });

  describe('getApplicableTierMultiplier', () => {
    const tiers = [
      { min_spend: 0, points_multiplier: 1 },
      { min_spend: 100000, points_multiplier: 1.5 },
      { min_spend: 300000, points_multiplier: 2 },
      { min_spend: 500000, points_multiplier: 3 },
    ];

    it('returns the base tier multiplier for a customer below every threshold but the base', () => {
      expect(getApplicableTierMultiplier(tiers, 50000)).toBe(1);
    });

    it('returns the highest tier whose min_spend the customer has cleared', () => {
      expect(getApplicableTierMultiplier(tiers, 150000)).toBe(1.5);
      expect(getApplicableTierMultiplier(tiers, 300000)).toBe(2);
      expect(getApplicableTierMultiplier(tiers, 1000000)).toBe(3);
    });

    it('defaults to 1x when no tiers are configured at all', () => {
      expect(getApplicableTierMultiplier([], 1000000)).toBe(1);
    });

    it('defaults to 1x when spend is below every configured tier (no zero-spend base tier)', () => {
      const tiersWithoutBase = [
        { min_spend: 100000, points_multiplier: 1.5 },
        { min_spend: 300000, points_multiplier: 2 },
      ];
      expect(getApplicableTierMultiplier(tiersWithoutBase, 50000)).toBe(1);
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

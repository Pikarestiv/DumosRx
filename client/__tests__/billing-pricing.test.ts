import { describe, it, expect } from 'vitest';
import {
  getDiscountedPrice,
  isDiscounted,
  getChargeAmount,
  isCurrentPlanHigherWeight,
  isCurrentPlan,
} from '../lib/utils/billing-pricing';
import type { AppliedCoupon } from '../lib/types/subscription-plans';

function coupon(overrides: Partial<AppliedCoupon>): AppliedCoupon {
  return {
    code: 'TESTCODE',
    type: 'discount_percent',
    value: 10,
    target_plan: null,
    target_interval: null,
    ...overrides,
  };
}

describe('getDiscountedPrice (display only)', () => {
  it('applies a percent discount', () => {
    expect(getDiscountedPrice(10000, coupon({ type: 'discount_percent', value: 20 }), 0)).toBe(8000);
  });

  it('applies a flat amount discount', () => {
    expect(getDiscountedPrice(10000, coupon({ type: 'discount_amount', value: 2500 }), 0)).toBe(7500);
  });

  it('shows a credit-only discount when there is no coupon', () => {
    // Regression: previously the function early-returned the unchanged
    // price whenever there was no coupon, even with credits available.
    expect(getDiscountedPrice(10000, null, 3000)).toBe(7000);
  });

  it('combines a coupon discount and credits for display', () => {
    // Coupon knocks 10000 -> 8000 (20% off), then 1000 credits -> 7000.
    expect(getDiscountedPrice(10000, coupon({ type: 'discount_percent', value: 20 }), 1000)).toBe(7000);
  });

  it('clamps at 0 when discounts exceed the price', () => {
    expect(getDiscountedPrice(1000, coupon({ type: 'discount_amount', value: 5000 }), 0)).toBe(0);
    expect(getDiscountedPrice(1000, null, 5000)).toBe(0);
  });

  it('never discounts a free (0) plan', () => {
    expect(getDiscountedPrice(0, coupon({ type: 'discount_percent', value: 50 }), 500)).toBe(0);
  });

  it('ignores a non-finite coupon value safely, without producing NaN', () => {
    const badCoupon = coupon({ type: 'discount_amount', value: Number.NaN });
    const result = getDiscountedPrice(10000, badCoupon, 0);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBe(10000);
  });
});

describe('isDiscounted', () => {
  it('is false with no coupon and no credits', () => {
    expect(isDiscounted(10000, null, 0)).toBe(false);
  });

  it('is true with credits alone', () => {
    expect(isDiscounted(10000, null, 500)).toBe(true);
  });

  it('is true with a coupon alone', () => {
    expect(isDiscounted(10000, coupon({}), 0)).toBe(true);
  });

  it('is false for a free plan even with a coupon', () => {
    expect(isDiscounted(0, coupon({}), 500)).toBe(false);
  });
});

describe('getChargeAmount (amount actually sent to pay())', () => {
  it('applies only the coupon discount, never referral credits', () => {
    // This is the double-counting regression: use_credits already tells the
    // server to apply credits, so the sent amount must reflect only the
    // coupon portion regardless of how much credit the user has.
    const withCoupon = coupon({ type: 'discount_percent', value: 20 });
    expect(getChargeAmount(10000, withCoupon)).toBe(8000);
  });

  it('returns the base price unchanged when there is no coupon, even with credits available', () => {
    expect(getChargeAmount(10000, null)).toBe(10000);
  });

  it('applies a flat amount discount', () => {
    expect(getChargeAmount(10000, coupon({ type: 'discount_amount', value: 3000 }))).toBe(7000);
  });

  it('clamps at 0', () => {
    expect(getChargeAmount(1000, coupon({ type: 'discount_amount', value: 5000 }))).toBe(0);
  });

  it('ignores a non-finite coupon value safely', () => {
    const badCoupon = coupon({ type: 'discount_percent', value: Number.POSITIVE_INFINITY });
    const result = getChargeAmount(10000, badCoupon);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(10000);
  });
});

describe('isCurrentPlanHigherWeight', () => {
  it('detects a downgrade from an exact tier id', () => {
    expect(isCurrentPlanHigherWeight('starter', 'pro')).toBe(true);
    expect(isCurrentPlanHigherWeight('enterprise', 'pro')).toBe(false);
  });

  it('matches descriptive server plan strings', () => {
    expect(isCurrentPlanHigherWeight('starter', 'Pro Monthly')).toBe(true);
    expect(isCurrentPlanHigherWeight('starter', 'pro_yearly')).toBe(true);
    expect(isCurrentPlanHigherWeight('free', 'Enterprise Annual')).toBe(true);
  });

  it('falls back to free when plan is undefined', () => {
    expect(isCurrentPlanHigherWeight('free', undefined)).toBe(false);
    expect(isCurrentPlanHigherWeight('starter', undefined)).toBe(false);
  });
});

describe('isCurrentPlan', () => {
  it('matches exact tier ids', () => {
    expect(isCurrentPlan('pro', 'pro')).toBe(true);
    expect(isCurrentPlan('pro', 'starter')).toBe(false);
  });

  it('matches descriptive server plan strings', () => {
    expect(isCurrentPlan('Pro Monthly', 'pro')).toBe(true);
    expect(isCurrentPlan('pro_yearly', 'pro')).toBe(true);
    expect(isCurrentPlan('Enterprise Annual', 'enterprise')).toBe(true);
  });
});

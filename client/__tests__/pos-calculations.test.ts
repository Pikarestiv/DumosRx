import { describe, it, expect } from 'vitest';
import {
  calculateSubtotal,
  calculateTax,
  calculateDiscountAmount,
  calculateTotal,
  calculateChangeDue,
  calculateSplitShortage,
} from '@/lib/utils/pos-calculations';

describe('POS Calculations', () => {
  it('calculates subtotal correctly', () => {
    const items = [{ subtotal: 100 }, { subtotal: 250 }, { subtotal: 50 }];
    expect(calculateSubtotal(items)).toBe(400);
    expect(calculateSubtotal([])).toBe(0);
  });

  it('calculates tax correctly', () => {
    expect(calculateTax(1000, 7.5)).toBe(75); // 7.5% of 1000
    expect(calculateTax(500, 0)).toBe(0); // 0% tax
    expect(calculateTax(-100, 5)).toBe(0); // Negative subtotal
  });

  it('calculates fixed discount correctly', () => {
    expect(calculateDiscountAmount(1000, 200, 'fixed')).toBe(200);
    expect(calculateDiscountAmount(1000, 0, 'fixed')).toBe(0);
  });

  it('calculates percentage discount correctly', () => {
    expect(calculateDiscountAmount(1000, 15, 'percentage')).toBe(150); // 15% of 1000
    expect(calculateDiscountAmount(200, 10, 'percentage')).toBe(20);
  });

  it('calculates total correctly', () => {
    // subtotal = 1000, tax = 75, discount = 150 -> 1000 + 75 - 150 = 925
    expect(calculateTotal(1000, 75, 150)).toBe(925);
    // Prevents negative total
    expect(calculateTotal(100, 0, 150)).toBe(0);
  });

  it('calculates change due correctly', () => {
    expect(calculateChangeDue(1000, 925)).toBe(75);
    expect(calculateChangeDue(500, 925)).toBe(0); // Exact or underpayment yields 0 change
  });

  describe('Split Payments', () => {
    it('handles exact split payments', () => {
      const splits = [{ amount: 500 }, { amount: 425 }];
      const result = calculateSplitShortage(splits, 925);
      
      expect(result.isFullyCovered).toBe(true);
      expect(result.totalSplitAmount).toBe(925);
      expect(result.shortageAmount).toBe(0);
      expect(result.changeDueAmount).toBe(0);
    });

    it('handles underpayment (shortage)', () => {
      const splits = [{ amount: 500 }, { amount: 200 }];
      const result = calculateSplitShortage(splits, 925);
      
      expect(result.isFullyCovered).toBe(false);
      expect(result.totalSplitAmount).toBe(700);
      expect(result.shortageAmount).toBe(225);
      expect(result.changeDueAmount).toBe(0);
    });

    it('handles overpayment (change due)', () => {
      const splits = [{ amount: 500 }, { amount: 500 }];
      const result = calculateSplitShortage(splits, 925);
      
      expect(result.isFullyCovered).toBe(true);
      expect(result.totalSplitAmount).toBe(1000);
      expect(result.shortageAmount).toBe(0);
      expect(result.changeDueAmount).toBe(75);
    });
  });
});

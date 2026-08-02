import { describe, it, expect } from 'vitest';
import {
  calculateSubtotal,
  calculateTax,
  calculateDiscountAmount,
  calculateTotal,
  calculateChangeDue,
  calculateSplitShortage,
  calculateTaxPercentage,
  calculateProportionalRefund,
  calculateNetSaleAmount,
  calculateAvgBasket,
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

  describe('Tax percentage (stored on sale, derived not hardcoded)', () => {
    it('derives the effective rate from actual tax/subtotal', () => {
      expect(calculateTaxPercentage(75, 1000)).toBe(7.5);
    });

    it('returns 0 when VAT is disabled (tax amount is 0)', () => {
      expect(calculateTaxPercentage(0, 1000)).toBe(0);
    });

    it('returns 0 for a zero or negative subtotal instead of dividing by zero', () => {
      expect(calculateTaxPercentage(0, 0)).toBe(0);
      expect(calculateTaxPercentage(75, -100)).toBe(0);
    });
  });

  describe('Proportional refund (tax/discount share included on returns)', () => {
    it('refunds exactly the sale total when every item is returned', () => {
      // subtotal 1000, 7.5% tax = 75, total = 1075. Returning all of it
      // must refund the full 1075, not just the 1000 item price.
      const refund = calculateProportionalRefund({
        itemsSubtotal: 1000,
        saleSubtotal: 1000,
        saleTaxAmount: 75,
        saleDiscountAmount: 0,
      });
      expect(refund).toBe(1075);
    });

    it('refunds a proportional tax/discount share on a partial return', () => {
      // Sale: subtotal 1000, tax 75 (7.5%), discount 100. Returning half the items.
      const refund = calculateProportionalRefund({
        itemsSubtotal: 500,
        saleSubtotal: 1000,
        saleTaxAmount: 75,
        saleDiscountAmount: 100,
      });
      // 500 + (0.5 * 75) - (0.5 * 100) = 500 + 37.5 - 50 = 487.5
      expect(refund).toBe(487.5);
    });

    it('refunds only the item price when VAT is 0', () => {
      const refund = calculateProportionalRefund({
        itemsSubtotal: 500,
        saleSubtotal: 1000,
        saleTaxAmount: 0,
        saleDiscountAmount: 0,
      });
      expect(refund).toBe(500);
    });

    it('never returns a negative refund', () => {
      // Pathological case: discount larger than the subtotal itself.
      const refund = calculateProportionalRefund({
        itemsSubtotal: 100,
        saleSubtotal: 1000,
        saleTaxAmount: 0,
        saleDiscountAmount: 1500,
      });
      expect(refund).toBe(0);
    });
  });

  describe('Net sale amount and average basket (POS recent-sales tile)', () => {
    it('nets a fully refunded sale down to zero', () => {
      expect(calculateNetSaleAmount(1075, 1075)).toBe(0);
    });

    it('nets a partially refunded sale to the remainder', () => {
      expect(calculateNetSaleAmount(1075, 487.5)).toBe(587.5);
    });

    it('averages net sales across today\'s transactions, including fully-returned ones as zero', () => {
      const sales = [
        { totalAmount: 1000, totalRefunded: 0 },
        { totalAmount: 1075, totalRefunded: 1075 }, // fully returned
        { totalAmount: 2500, totalRefunded: 0 },
      ];
      // (1000 + 0 + 2500) / 3 = 1166.67
      expect(calculateAvgBasket(sales)).toBeCloseTo(1166.67, 2);
    });

    it('returns 0 average when there are no sales today', () => {
      expect(calculateAvgBasket([])).toBe(0);
    });
  });
});

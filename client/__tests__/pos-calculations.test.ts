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
  calculateMixedAmountPaid,
  calculateMixedChangeDue,
  calculateSalePaymentStatus,
  roundMoney,
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

  describe('VAT on net-of-discount subtotal (KNOWN_BUGS.md - VAT charged on pre-discount subtotal)', () => {
    it('charges VAT on the discounted subtotal, not the raw subtotal', () => {
      // Cart 10,000, discount 2,000, VAT 7.5%. Correct VAT is 7.5% of the
      // net 8,000 = 600, not 7.5% of the raw 10,000 (= 750).
      const subtotal = 10000;
      const discountAmount = calculateDiscountAmount(subtotal, 2000, 'fixed');
      const tax = calculateTax(subtotal - discountAmount, 7.5);
      const total = calculateTotal(subtotal, tax, discountAmount);

      expect(tax).toBe(600);
      // 10,000 + 600 - 2,000 = 8,600, i.e. the discounted 8,000 net plus tax.
      expect(total).toBe(8600);
    });

    it('a loyalty redemption (which shares the discount slot) is taxed the same way', () => {
      // A ₦1,500 redeemed reward behaves exactly like a fixed discount for
      // tax purposes, since it flows through the same discount amount.
      const subtotal = 5000;
      const redeemedDiscount = calculateDiscountAmount(subtotal, 1500, 'fixed');
      const tax = calculateTax(subtotal - redeemedDiscount, 7.5);
      const total = calculateTotal(subtotal, tax, redeemedDiscount);

      expect(tax).toBe(roundMoney(3500 * 0.075));
      expect(total).toBe(roundMoney(3500 + tax));
    });
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

    it('rounds the refund to the cent instead of accumulating float dust', () => {
      // Chosen so the raw arithmetic produces a repeating/non-terminating
      // binary fraction (float dust) if not rounded.
      const refund = calculateProportionalRefund({
        itemsSubtotal: 10,
        saleSubtotal: 30,
        saleTaxAmount: 10,
        saleDiscountAmount: 0,
      });
      // 10 + (1/3)*10 = 13.333... -> must round to 13.33
      expect(refund).toBe(13.33);
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

  describe('Mixed-payment amount paid and status (KNOWN_BUGS.md #6)', () => {
    it('excludes the credit split from amount actually collected', () => {
      // Regression: a ₦1000 sale split cash ₦600 / credit ₦400 previously
      // recorded amount_paid as 1000 (the full split sum), making the sale
      // look fully paid when ₦400 was never actually collected.
      const splits = [
        { method: 'cash', amount: 600 },
        { method: 'credit', amount: 400 },
      ];
      expect(calculateMixedAmountPaid(splits)).toBe(600);
    });

    it('sums all splits when none of them are credit', () => {
      const splits = [
        { method: 'cash', amount: 600 },
        { method: 'card', amount: 400 },
      ];
      expect(calculateMixedAmountPaid(splits)).toBe(1000);
    });

    it('marks a mixed sale with a credit portion as "partial", not "completed"', () => {
      const splits = [
        { method: 'cash', amount: 600 },
        { method: 'credit', amount: 400 },
      ];
      expect(calculateSalePaymentStatus('mixed', splits)).toBe('partial');
    });

    it('marks a mixed sale with no credit portion as "completed"', () => {
      const splits = [
        { method: 'cash', amount: 600 },
        { method: 'card', amount: 400 },
      ];
      expect(calculateSalePaymentStatus('mixed', splits)).toBe('completed');
    });

    it('marks a pure credit sale as "pending" regardless of splits', () => {
      expect(calculateSalePaymentStatus('credit', [])).toBe('pending');
    });

    it('marks cash/card/transfer sales as "completed"', () => {
      expect(calculateSalePaymentStatus('cash', [])).toBe('completed');
      expect(calculateSalePaymentStatus('card', [])).toBe('completed');
      expect(calculateSalePaymentStatus('transfer', [])).toBe('completed');
    });
  });

  describe('Mixed-payment change due (excludes credit from the amount that can produce change)', () => {
    it('gives no change when a credit split alone covers the shortfall exactly', () => {
      // ₦10,000 total: ₦3,000 cash + ₦7,000 credit. Nothing was overpaid.
      const splits = [
        { method: 'cash', amount: 3000 },
        { method: 'credit', amount: 7000 },
      ];
      expect(calculateMixedChangeDue(splits, 10000)).toBe(0);
    });

    it('does not treat an over-allocated credit split as cash overpayment', () => {
      // Regression: a ₦10,000 sale with ₦5,000 cash entered, then a credit
      // split auto-filled to the full ₦10,000 remaining before the cashier
      // corrected it, previously computed change from the raw split total
      // (5000 + 10000 = 15000 -&gt; "change: 5000"), handing out cash that was
      // never actually tendered. Only the ₦5,000 cash was real money; it
      // doesn't cover the ₦10,000 total, so no change is due.
      const splits = [
        { method: 'cash', amount: 5000 },
        { method: 'credit', amount: 10000 },
      ];
      expect(calculateMixedChangeDue(splits, 10000)).toBe(0);
    });

    it('gives change from a real overpayment on the non-credit tender', () => {
      // ₦10,000 total, ₦12,000 cash, no credit: ₦2,000 change is real.
      const splits = [{ method: 'cash', amount: 12000 }];
      expect(calculateMixedChangeDue(splits, 10000)).toBe(2000);
    });

    it('gives change computed only from the non-credit portion when both cash and credit are present', () => {
      // ₦10,000 total, ₦11,000 cash (genuinely overpaid), ₦0 credit but a
      // stray zero-amount credit split shouldn't affect the result.
      const splits = [
        { method: 'cash', amount: 11000 },
        { method: 'credit', amount: 0 },
      ];
      expect(calculateMixedChangeDue(splits, 10000)).toBe(1000);
    });
  });
});

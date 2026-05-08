/**
 * Subscription Pricing Constants
 * Prices are in Naira (NGN)
 */

export const PRICING = {
  FREE: {
    NAME: "Starter",
    PRICE_MONTHLY: 0,
    PRICE_YEARLY: 0,
  },
  PRO: {
    NAME: "Professional",
    PRICE_MONTHLY: 15000,
    PRICE_YEARLY: 12000, // Monthly equivalent when billed yearly
    BILLING_YEARLY_TOTAL: 144000,
    SAVINGS_YEARLY: 36000,
    PAYSTACK_AMOUNT_KOBO: 1500000, // Kobo for Paystack (₦15,000 * 100)
  },
  ENTERPRISE: {
    NAME: "Enterprise",
    PRICE: "Custom",
  }
};

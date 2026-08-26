import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('billing API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getSubscriptionStatus fetches /subscription/status', async () => {
    const payload = { status: 'active', plan: 'Pro', days_remaining: 12 };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getSubscriptionStatus();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/status');
  });

  it('pay posts to /subscription/pay with the payment payload', async () => {
    const response = { success: true, payment_url: 'https://pay.example/x' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => response,
    });

    const result = await apiClient.pay({
      amount: 8000,
      plan_name: 'Pro',
      interval: 'monthly',
    });

    expect(result).toEqual(response);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/pay');
    expect(JSON.parse(config.body)).toEqual({
      amount: 8000,
      plan_name: 'Pro',
      interval: 'monthly',
    });
  });

  it('getReferralStats fetches /subscription/referral-stats', async () => {
    const payload = { referral_code: 'ABC123', referral_credits: 500, referrals: [], transactions: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getReferralStats();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/referral-stats');
  });

  it('validateCoupon posts to /subscription/validate-coupon', async () => {
    const payload = { valid: true, coupon: { code: 'SAVE10', type: 'discount_percent', value: 10, target_plan: null, target_interval: null } };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.validateCoupon({ code: 'SAVE10' });

    expect(result).toEqual(payload);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/validate-coupon');
    expect(JSON.parse(config.body)).toEqual({ code: 'SAVE10' });
  });

  it('verifyPayment posts the reference to /subscription/verify', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await apiClient.verifyPayment('ref-123');

    expect(result).toEqual({ success: true });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/verify');
    expect(JSON.parse(config.body)).toEqual({ reference: 'ref-123' });
  });

  it('getBillingHistory fetches /subscription/billing-history', async () => {
    const payload = { transactions: [{ id: '1', date: '2026-01-01', desc: 'Pro Plan', amount: 8000, status: 'Success' }] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getBillingHistory();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/subscription/billing-history');
  });
});

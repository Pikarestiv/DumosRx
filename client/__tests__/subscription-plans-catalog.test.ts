import { describe, it, expect } from 'vitest';
import { getSubscriptionPlans } from '../lib/constants/subscription-plans-catalog';

describe('getSubscriptionPlans', () => {
  const formatPrice = (price: number) => `₦${price.toLocaleString()}`;

  it('falls back to default prices when config is null', () => {
    const plans = getSubscriptionPlans(null, false, formatPrice);
    const pro = plans.find((p) => p.id === 'pro');
    expect(pro?.numericPrice).toBe(8000);
    expect(pro?.popular).toBe(true);
  });

  it('uses configured monthly price when present', () => {
    const config = { tiers: { pro: { price_monthly: 9500, price_yearly: 95000 } } };
    const plans = getSubscriptionPlans(config, false, formatPrice);
    const pro = plans.find((p) => p.id === 'pro');
    expect(pro?.numericPrice).toBe(9500);
    expect(pro?.price).toBe('₦9,500');
  });

  it('marks a limit of -1 as Unlimited', () => {
    const config = { tiers: { enterprise: { limits: { stores: -1 } } } };
    const plans = getSubscriptionPlans(config, false, formatPrice);
    const enterprise = plans.find((p) => p.id === 'enterprise');
    expect(enterprise?.features).toContain('Unlimited Connected Devices');
  });
});

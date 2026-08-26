import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('fleet stats API method', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getFleetStats fetches /dashboard/stats', async () => {
    const payload = {
      stats: {
        total_sales: { value: 50000, growth: '12.5%' },
        inventory_value: { value: 100000 },
        customers: { value: 20, growth: '+3 new' },
        stores_count: 2,
        last_sync: '5 minutes ago',
        cloud_storage: { used_gb: 0.1, limit_gb: 10, percentage: 1 },
      },
      stores: [
        { id: '1', name: 'Main Branch', location: 'Lagos', status: 'online', lastSync: '5 minutes ago', sales: '₦50,000.00', staff_count: 2, low_stock_alerts: 1, expiring_items: 0 },
      ],
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getFleetStats();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/dashboard/stats');
  });

  it('sendEndOfDaySummary posts to /dashboard/send-summary with no body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'End of day summary generated and sent to owner@dumosrx.com' }),
    });

    const result = await apiClient.sendEndOfDaySummary();

    expect(result).toEqual({ message: 'End of day summary generated and sent to owner@dumosrx.com' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/dashboard/send-summary');
    expect(config.method).toBe('POST');
  });
});

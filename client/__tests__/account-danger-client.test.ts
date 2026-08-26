import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('account danger-zone API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resetData posts type and password to /dashboard/reset', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Reset complete' }),
    });

    const result = await apiClient.resetData('sales', 'my-password');

    expect(result).toEqual({ message: 'Reset complete' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/dashboard/reset');
    expect(JSON.parse(config.body)).toEqual({ type: 'sales', password: 'my-password' });
  });

  it('requestAccountDeletion posts reason and password to /profile/request-deletion', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Account deletion requested successfully.' }),
    });

    const result = await apiClient.requestAccountDeletion({ reason: 'Closing up', password: 'my-password' });

    expect(result).toEqual({ message: 'Account deletion requested successfully.' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/profile/request-deletion');
    expect(JSON.parse(config.body)).toEqual({ reason: 'Closing up', password: 'my-password' });
  });

  it('cancelAccountDeletion posts to /profile/cancel-deletion with no body', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Account deletion request cancelled successfully.' }),
    });

    const result = await apiClient.cancelAccountDeletion();

    expect(result).toEqual({ message: 'Account deletion request cancelled successfully.' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/profile/cancel-deletion');
    expect(config.method).toBe('POST');
  });
});

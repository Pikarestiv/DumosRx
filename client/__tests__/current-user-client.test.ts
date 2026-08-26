import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('current user API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getProfile fetches /user', async () => {
    const payload = { id: '1', first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', role: 'store_owner' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getProfile();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/user');
  });

  it('updateProfile posts to /profile/update with the profile payload', async () => {
    const response = { message: 'Profile updated successfully', user: { id: '1', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', role: 'store_owner' } };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => response,
    });

    const result = await apiClient.updateProfile({ first_name: 'Jane', last_name: 'Smith', phone: '08012345678' });

    expect(result).toEqual(response);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/profile/update');
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body)).toEqual({ first_name: 'Jane', last_name: 'Smith', phone: '08012345678' });
  });
});

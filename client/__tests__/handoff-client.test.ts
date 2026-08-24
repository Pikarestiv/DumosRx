import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('handoff code API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createHandoffCode posts to /auth/handoff with an explicit Authorization header', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'abc123', expires_in: 60 }),
    });

    const result = await apiClient.createHandoffCode('my-token');

    expect(result).toEqual({ code: 'abc123', expires_in: 60 });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/handoff');
    expect(config.headers.Authorization).toBe('Bearer my-token');
    expect(JSON.parse(config.body)).toEqual({ token: 'my-token' });
  });

  it('consumeHandoffCode posts to /auth/handoff/consume and returns token + user', async () => {
    const payload = {
      token: 'restored-token',
      user: { id: '1', email: 'a@b.com', name: 'A B', role: 'store_owner' },
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.consumeHandoffCode('xyz789');

    expect(result).toEqual(payload);
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/auth/handoff/consume');
    expect(JSON.parse(config.body)).toEqual({ code: 'xyz789' });
  });
});

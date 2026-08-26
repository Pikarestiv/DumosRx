import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('sessions API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('getSessions fetches /sessions', async () => {
    const payload = [{ id: '1', name: 'Client App', ip_address: '1.2.3.4', user_agent: null, last_used_at: '2026-01-01', created_at: '2026-01-01', is_current: true }];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    const result = await apiClient.getSessions();

    expect(result).toEqual(payload);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/sessions');
  });

  it('revokeSession deletes /sessions/:id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Session revoked' }),
    });

    const result = await apiClient.revokeSession('1');

    expect(result).toEqual({ message: 'Session revoked' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/sessions/1');
    expect(config.method).toBe('DELETE');
  });

  it('revokeAllSessions posts to /sessions/revoke-all', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'All other sessions revoked' }),
    });

    const result = await apiClient.revokeAllSessions();

    expect(result).toEqual({ message: 'All other sessions revoked' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/sessions/revoke-all');
    expect(config.method).toBe('POST');
  });
});

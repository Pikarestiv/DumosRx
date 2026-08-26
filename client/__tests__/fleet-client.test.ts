import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../lib/api/client';

describe('fleet store API methods', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createStore posts to /stores with the store payload', async () => {
    const store = { id: '1', name: 'Main Branch', location: 'Lagos', address: null, phone: null, store_type: 'pharmacy' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Store registered successfully', store }),
    });

    const result = await apiClient.createStore({ name: 'Main Branch', location: 'Lagos', store_type: 'pharmacy' });

    expect(result).toEqual({ message: 'Store registered successfully', store });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/stores');
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body)).toEqual({ name: 'Main Branch', location: 'Lagos', store_type: 'pharmacy' });
  });

  it('updateStore puts to /stores/:id with the store payload', async () => {
    const store = { id: '1', name: 'Main Branch Updated', location: 'Lagos', address: null, phone: null, store_type: 'pharmacy' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Store updated successfully', store }),
    });

    const result = await apiClient.updateStore('1', { name: 'Main Branch Updated', store_type: 'pharmacy' });

    expect(result).toEqual({ message: 'Store updated successfully', store });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/stores/1');
    expect(config.method).toBe('PUT');
    expect(JSON.parse(config.body)).toEqual({ name: 'Main Branch Updated', store_type: 'pharmacy' });
  });

  it('deleteStore deletes /stores/:id', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'Store removed successfully' }),
    });

    const result = await apiClient.deleteStore('1');

    expect(result).toEqual({ message: 'Store removed successfully' });
    const [url, config] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/stores/1');
    expect(config.method).toBe('DELETE');
  });
});

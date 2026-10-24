import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Query } from '@tanstack/react-query';
import { query, execute } from '../lib/db/core';
import { asAsync } from './helpers/as-async';

vi.mock('../lib/db/core', async () => {
  const actual = await vi.importActual<typeof import('../lib/db/core')>('../lib/db/core');
  return {
    ...actual,
    execute: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    logAction: vi.fn().mockResolvedValue(undefined),
    // push.ts wraps its per-batch local writes in transaction() to defer sql.js's saveDatabase() export to once per batch inst…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-engine-test-ts-L14
    transaction: vi.fn((fn: () => unknown) => fn()),
  };
});

import { pullChanges } from '../lib/db/sync-engine/pull';
import { sync } from '../lib/db/sync-engine';
import { apiClient } from '../lib/api/client';
import { queryClient } from '../lib/query-client';

vi.mock('../lib/db/local-database', async () => {
  const actual = await vi.importActual<typeof import('../lib/db/local-database')>('../lib/db/local-database');
  return {
    ...actual,
    isTauri: vi.fn().mockReturnValue(true),
  };
});

vi.mock('../lib/db/sync-engine/legacy-product-attribution', () => ({
  attributeStorelessProductsFromEvidence: vi.fn().mockResolvedValue(0),
}));

vi.mock('../lib/api/client', () => ({
  apiClient: {
    pushChanges: vi.fn(),
    pullChanges: vi.fn(),
    getSystemConfig: vi.fn().mockResolvedValue({ success: true, data: "{}" }),
  }
}));

vi.mock('../lib/query-client', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  }
}));

describe('Sync Engine pull callbacks and sync()', () => {
  afterEach(() => new Promise((resolve) => setTimeout(resolve, 0)));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pullChanges() onCriticalTablesReady (setup fast-login path)', () => {
    it('fires once stores and users have drained, even while another table still has more pages', async () => {
      vi.mocked(apiClient.pullChanges)
        .mockResolvedValueOnce({
          success: true,
          changes: {
            stores: [{ id: 'store-1', name: 'Store One', _version: 1, deleted_at: null }],
            users: [{ id: 'user-1', username: 'owner', role: 'store_owner', _version: 1, deleted_at: null }],
            products: [{ id: 'p1', name: 'Panadol', _version: 1, deleted_at: null }],
          },
          server_timestamp: '2026-09-25T00:00:00Z',
          has_more: { stores: false, users: false, products: true },
        })
        .mockResolvedValueOnce({
          success: true,
          changes: {
            products: [{ id: 'p2', name: 'Ibuprofen', _version: 1, deleted_at: null }],
          },
          server_timestamp: '2026-09-25T00:00:00Z',
          has_more: { products: false },
        });

      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      }));

      const onCriticalTablesReady = vi.fn();
      await pullChanges(false, true, onCriticalTablesReady);

      expect(onCriticalTablesReady).toHaveBeenCalledTimes(1);
    });

    it('does not fire until every page has been fetched when stores/users are still pending', async () => {
      vi.mocked(apiClient.pullChanges)
        .mockResolvedValueOnce({
          success: true,
          changes: {
            stores: [{ id: 'store-1', name: 'Store One', _version: 1, deleted_at: null }],
            users: [{ id: 'user-1', username: 'owner', role: 'store_owner', _version: 1, deleted_at: null }],
          },
          server_timestamp: '2026-09-25T00:00:00Z',
          // stores still has another page; users is already fully drained.
          has_more: { stores: true, users: false },
        })
        .mockResolvedValueOnce({
          success: true,
          changes: {
            stores: [{ id: 'store-2', name: 'Store Two', _version: 1, deleted_at: null }],
          },
          server_timestamp: '2026-09-25T00:00:00Z',
          has_more: { stores: false },
        });

      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      }));

      let pullCallCountWhenFired = -1;
      const onCriticalTablesReady = vi.fn(() => {
        pullCallCountWhenFired = vi.mocked(apiClient.pullChanges).mock.calls.length;
      });
      await pullChanges(false, true, onCriticalTablesReady);

      // Falls back to firing once at the very end regardless (see pull.ts's doc comment on the fallback) — but only via that fal…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-engine-test-ts-L380
      expect(onCriticalTablesReady).toHaveBeenCalledTimes(1);
      expect(pullCallCountWhenFired).toBe(2);
    });

    it('is a no-op when not passed (normal, non-setup pulls)', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {},
        server_timestamp: '2026-09-25T00:00:00Z',
      });
      vi.mocked(query).mockResolvedValue([]);

      await expect(pullChanges()).resolves.toBeDefined();
    });

    it('still fires (via finally) when the pull throws, but reports the pull as failed', async () => {
      vi.mocked(apiClient.pullChanges).mockRejectedValueOnce(new Error('Network error'));
      vi.mocked(query).mockResolvedValue([]);

      const onCriticalTablesReady = vi.fn();
      await expect(pullChanges(false, true, onCriticalTablesReady)).rejects.toThrow('Network error');

      // Nothing was written (the page transaction carrying stores AND users rolls back as a unit), so a caller must not read the…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-engine-test-ts-L406
      expect(onCriticalTablesReady).toHaveBeenCalledTimes(1);
      expect(onCriticalTablesReady).toHaveBeenCalledWith(false);
    });

    it('reports the pull as succeeded when the critical tables actually drained', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          stores: [{ id: 'store-1', name: 'Store One', _version: 1, deleted_at: null }],
          users: [{ id: 'user-1', username: 'owner', role: 'store_owner', _version: 1, deleted_at: null }],
        },
        server_timestamp: '2026-09-25T00:00:00Z',
        has_more: { stores: false, users: false },
      });
      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      }));

      const onCriticalTablesReady = vi.fn();
      await pullChanges(false, true, onCriticalTablesReady);

      expect(onCriticalTablesReady).toHaveBeenCalledWith(true);
    });

    it('propagates the failure flag through sync() to its caller', async () => {
      localStorage.setItem('auth_token', 'test-token');
      vi.mocked(apiClient.pushChanges).mockResolvedValue({ success: true });
      vi.mocked(apiClient.pullChanges).mockRejectedValueOnce(new Error('Server error'));
      vi.mocked(query).mockResolvedValue([]);

      const onCriticalTablesReady = vi.fn();
      const result = await sync(false, true, onCriticalTablesReady);

      expect(result.success).toBe(false);
      expect(onCriticalTablesReady).toHaveBeenCalledWith(false);
    });
  });

  describe('pullChanges() with a table missing from the local schema', () => {
    it('skips that table and still commits the rest of the page', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          stores: [{ id: 'store-1', name: 'Store One', _version: 1, deleted_at: null }],
          users: [{ id: 'user-1', name: 'owner', _version: 1, deleted_at: null }],
          permission_groups: [{ id: 'pg-1', name: 'Cashier', _version: 1, deleted_at: null }],
        },
        server_timestamp: '2026-09-25T00:00:00Z',
        has_more: { stores: false, users: false, permission_groups: false },
      });

      // A device whose local SQLite predates the migration that added permission_groups:
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-engine-test-ts-L463
      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('permission_groups')) {
          if (sql.includes('PRAGMA table_info')) return [];
          throw new Error('no such table: permission_groups');
        }
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      }));

      const onCriticalTablesReady = vi.fn();
      await expect(pullChanges(false, true, onCriticalTablesReady)).resolves.toBeDefined();

      const written = vi.mocked(execute).mock.calls.map((c) => String(c[0]));
      expect(written.some((sql) => sql.includes('INTO stores') || sql.includes('UPDATE stores'))).toBe(true);
      expect(written.some((sql) => sql.includes('INTO users') || sql.includes('UPDATE users'))).toBe(true);
      expect(written.some((sql) => sql.includes('permission_groups'))).toBe(false);
      expect(onCriticalTablesReady).toHaveBeenCalledWith(true);
    });
  });

  describe('sync() cache invalidation', () => {
    beforeEach(() => {
      localStorage.setItem('auth_token', 'test-token');
      vi.mocked(apiClient.pushChanges).mockResolvedValue({ success: true });
    });

    it('invalidates via a table-matching predicate when tables changed', async () => {
      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_queue')) return [];
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      }));
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          products: [{ id: 'rec3', name: 'Ibuprofen', _version: 1, deleted_at: null }],
        },
        server_timestamp: '2026-07-28T00:00:00Z',
      });

      await sync();

      const call = vi.mocked(queryClient.invalidateQueries).mock.calls.find(
        (c) => (c[0] as { predicate?: unknown })?.predicate,
      );
      if (!call) throw new Error("expected an invalidateQueries call with a predicate");
      const predicate = (call[0] as { predicate: (q: Query) => boolean }).predicate;

      // A query tagged for the table that changed gets invalidated.
      expect(predicate({ meta: { tables: ['products'] } } as unknown as Query)).toBe(true);
      // A query tagged only for unrelated tables is left alone.
      expect(predicate({ meta: { tables: ['customers'] } } as unknown as Query)).toBe(false);
      // Untagged (not-yet-migrated) queries still fall back to invalidating.
      expect(predicate({ meta: undefined } as unknown as Query)).toBe(true);
    });

    it('does not invalidate anything when no tables changed', async () => {
      vi.mocked(query).mockResolvedValue([]);
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {},
        server_timestamp: '2026-07-28T00:00:00Z',
      });

      await sync();

      const predicateCall = vi.mocked(queryClient.invalidateQueries).mock.calls.find(
        (c) => (c[0] as { predicate?: unknown })?.predicate,
      );
      expect(predicateCall).toBeUndefined();
    });
  });

  describe('sync() surfaces push failures', () => {
    beforeEach(() => {
      localStorage.setItem('auth_token', 'test-token');
    });

    it('reports success: false when a push batch throws, instead of a false "success" despite nothing pushing', async () => {
      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_queue')) {
          return [{
            id: 1,
            table_name: 'products',
            record_id: 'p1',
            operation: 'INSERT',
            payload: JSON.stringify({ id: 'p1', name: 'Panadol' }),
            created_at: '2026-08-01T00:00:00Z',
            retry_count: 0,
            last_error: null,
            next_retry_at: null,
          }];
        }
        return [];
      }));
      vi.mocked(apiClient.pushChanges).mockRejectedValueOnce(new Error('Network error'));
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {},
        server_timestamp: '2026-07-28T00:00:00Z',
      });

      const result = await sync();

      expect(result.success).toBe(false);
      expect(result.pushed).toBe(0);
      expect(String(result.error)).toContain('1 batch');
    });
  });
});

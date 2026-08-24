import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Query } from '@tanstack/react-query';
import { insert } from '../lib/db/base-helpers';
import { query, execute } from '../lib/db/core';

// Mock the core DB functions
vi.mock('../lib/db/core', async () => {
  const actual = await vi.importActual<typeof import('../lib/db/core')>('../lib/db/core');
  return {
    ...actual,
    execute: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

import { pushChanges } from '../lib/db/sync-engine/push';
import { pullChanges } from '../lib/db/sync-engine/pull';
import { sync } from '../lib/db/sync-engine';
import { apiClient } from '../lib/api/client';
import { queryClient } from '../lib/query-client';

// Mock local-database to force isTauri to true so it uses the execute() wrapper
vi.mock('../lib/db/local-database', async () => {
  const actual = await vi.importActual<typeof import('../lib/db/local-database')>('../lib/db/local-database');
  return {
    ...actual,
    isTauri: vi.fn().mockReturnValue(true),
  };
});

// Mock the API client
vi.mock('../lib/api/client', () => ({
  apiClient: {
    pushChanges: vi.fn(),
    pullChanges: vi.fn(),
    getSystemConfig: vi.fn().mockResolvedValue({ success: true, data: "{}" }),
  }
}));

// Mock QueryClient from React Query used in the app
vi.mock('../lib/query-client', () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  }
}));

describe('Sync Engine & Local Database', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Local Database Operations (Queueing)', () => {
    it('should add a new record and log to _sync_queue', async () => {
      const executeMock = vi.mocked(execute);
      
      const newProduct = {
        name: 'Aspirin',
        price: 100,
      };

      await insert('products', newProduct);

      // Verify the first execute is the original insert
      expect(executeMock.mock.calls[0][0]).toContain('INSERT INTO products');
      
      // Verify the second execute is logging to _sync_queue
      expect(executeMock.mock.calls[1][0]).toContain('INSERT INTO _sync_queue');
      const params = executeMock.mock.calls[1][1];
      expect(params).toBeDefined();
      expect(params![0]).toBe('products');
      expect(params![2]).toBe('INSERT');
      expect(typeof params![3]).toBe('string');
    });
  });

  describe('Pushing Changes', () => {
    it('should push pending items and clear the queue on success', async () => {
      // Mock getPendingSyncItems which uses query()
      vi.mocked(query).mockResolvedValueOnce([
        {
          id: 1,
          table_name: 'products',
          record_id: 'rec1',
          action: 'INSERT',
          payload: JSON.stringify({ id: 'rec1', name: 'Aspirin' })
        }
      ]);

      vi.mocked(apiClient.pushChanges).mockResolvedValueOnce({ success: true });
      
      const result = await pushChanges();
      
      expect(result.pushed).toBe(1);
      expect(apiClient.pushChanges).toHaveBeenCalledWith(
        {
          changes: [
            expect.objectContaining({
              table_name: 'products',
              action: 'INSERT'
            })
          ]
        },
        false,
        false
      );

      // Verify markSynced was called via execute() which does a DELETE
      const executeMock = vi.mocked(execute);
      expect(executeMock.mock.calls.some(call => call[0].includes('DELETE FROM _sync_queue'))).toBe(true);
    });
  });

  describe('Pulling Changes', () => {
    it('should pull changes and bump local _version', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          products: [
            { id: 'rec2', name: 'Paracetamol', _version: 2, deleted_at: null }
          ]
        },
        server_timestamp: '2026-07-21T00:00:00Z'
      });

      // We need to mock query calls inside pull.ts
      vi.mocked(query).mockImplementation(async (sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return []; // Record doesn't exist
        return [];
      });

      const result = await pullChanges();
      
      expect(result.pulled).toBe(1);
      
      // Verify upsert logic runs execute() for the new record
      const executeMock = vi.mocked(execute);
      const wasUpsertExecuted = executeMock.mock.calls.some(call => 
        call[0].includes('INSERT INTO products') || call[0].includes('UPDATE products')
      );
      
      expect(wasUpsertExecuted).toBe(true);
    });

    it('does not overwrite a local row with a pending unsynced edit, and does not advance the sync cursor for that table', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          products: [
            { id: 'rec-conflict', name: 'Server Name', _version: 5, deleted_at: null },
          ],
        },
        server_timestamp: '2026-07-21T00:00:00Z',
      });

      vi.mocked(query).mockImplementation(async (sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        }
        // A pending local edit exists for this exact record...
        if (sql.includes('FROM _sync_queue')) return [{ 1: 1 }];
        // ...and the record already exists locally.
        if (sql.includes('SELECT 1 FROM products')) return [{ 1: 1 }];
        return [];
      });

      const result = await pullChanges();

      // The conflicted record was deliberately skipped, not applied.
      expect(result.pulled).toBe(0);

      const executeMock = vi.mocked(execute);

      // No UPDATE/INSERT was issued for the conflicted record; the user's
      // own unsynced edit must survive until the next push resolves it.
      const touchedProducts = executeMock.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('products') &&
          (call[0].includes('UPDATE') || call[0].includes('INSERT')),
      );
      expect(touchedProducts).toBe(false);

      // The per-table sync cursor must not advance either, or the server's
      // copy of this record would never be re-offered once the local edit
      // is pushed and resolved.
      const cursorAdvanced = executeMock.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].includes('_sync_state'),
      );
      expect(cursorAdvanced).toBe(false);
    });

    it('prunes a local store not present in a stores pull response', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          stores: [
            { id: 'store-a', name: 'Store A', _version: 1, deleted_at: null },
            { id: 'store-b', name: 'Store B', _version: 1, deleted_at: null },
          ],
        },
        server_timestamp: '2026-07-21T00:00:00Z',
      });

      vi.mocked(query).mockImplementation(async (sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return []; // both records are new inserts
        return [];
      });

      await pullChanges();

      const executeMock = vi.mocked(execute);
      const pruneCall = executeMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('UPDATE stores SET _deleted = 1'),
      );

      expect(pruneCall).toBeDefined();
      // Every id the server actually returned must be excluded from the prune.
      expect(pruneCall?.[1]).toEqual(['store-a', 'store-b']);
    });

    it('does not touch stores at all when the pull response has no stores key', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          products: [{ id: 'rec1', name: 'Ibuprofen', _version: 1, deleted_at: null }],
        },
        server_timestamp: '2026-07-21T00:00:00Z',
      });

      vi.mocked(query).mockImplementation(async (sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      });

      await pullChanges();

      const executeMock = vi.mocked(execute);
      const touchedStores = executeMock.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('stores'),
      );
      expect(touchedStores).toBe(false);
    });
  });

  describe('sync() cache invalidation', () => {
    beforeEach(() => {
      localStorage.setItem('auth_token', 'test-token');
      vi.mocked(apiClient.pushChanges).mockResolvedValue({ success: true });
    });

    it('invalidates via a table-matching predicate when tables changed', async () => {
      vi.mocked(query).mockImplementation(async (sql: string) => {
        if (sql.includes('_sync_queue')) return [];
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      });
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
      expect(call).toBeDefined();
      const predicate = (call![0] as { predicate: (q: Query) => boolean }).predicate;

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
});

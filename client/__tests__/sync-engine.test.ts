import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insert } from '../lib/db/base-helpers';
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

import { pushChanges } from '../lib/db/sync-engine/push';
import { pullChanges } from '../lib/db/sync-engine/pull';
import { apiClient } from '../lib/api/client';

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
      expect(params?.[0]).toBe('products');
      expect(params?.[2]).toBe('INSERT');
      expect(typeof params?.[3]).toBe('string');
    });

    it('should queue a users-table insert exactly like any other table (no users-specific exclusion)', async () => {
      const executeMock = vi.mocked(execute);

      const newStaffMember = {
        first_name: 'Jane',
        last_name: 'Doe',
        username: 'jdoe',
        role: 'sales_staff',
        store_id: 'store-1',
        pin: '1234',
      };

      await insert('users', newStaffMember);

      expect(executeMock.mock.calls[0][0]).toContain('INSERT INTO users');
      expect(executeMock.mock.calls[1][0]).toContain('INSERT INTO _sync_queue');
      const params = executeMock.mock.calls[1][1];
      expect(params?.[0]).toBe('users');
      expect(params?.[2]).toBe('INSERT');
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
      // objectContaining: the payload also carries stock_fingerprint now
      // (the per-device stock report), which this test is not about.
      expect(apiClient.pushChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: [
            expect.objectContaining({
              table_name: 'products',
              action: 'INSERT'
            })
          ]
        }),
        false,
        false,
        expect.any(String),
        null,
      );

      // Verify markSynced was called via execute() which does a DELETE
      const executeMock = vi.mocked(execute);
      expect(executeMock.mock.calls.some(call => call[0].includes('DELETE FROM _sync_queue'))).toBe(true);
    });

    it('should push a pending users change through the same generic path as any other table', async () => {
      vi.mocked(query).mockResolvedValueOnce([
        {
          id: 1,
          table_name: 'users',
          record_id: 'user-1',
          action: 'INSERT',
          payload: JSON.stringify({ id: 'user-1', username: 'jdoe', role: 'sales_staff' }),
        },
      ]);

      vi.mocked(apiClient.pushChanges).mockResolvedValueOnce({ success: true });

      const result = await pushChanges();

      expect(result.pushed).toBe(1);
      const sentPayload = vi.mocked(apiClient.pushChanges).mock.calls[0][0];
      expect(sentPayload.changes[0].table_name).toBe('users');
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
      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return []; // Record doesn't exist
        return [];
      }));

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

      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('PRAGMA table_info')) {
          return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        }
        // A pending local edit exists for this exact record...
        if (sql.includes('FROM _sync_queue')) return [{ 1: 1 }];
        // ...and the record already exists locally.
        if (sql.includes('SELECT 1 FROM products')) return [{ 1: 1 }];
        return [];
      }));

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

      // The per-table sync cursor must not advance either, or the server's copy of this record would never be re-offered once th…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-engine-test-ts-L240
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

      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        // The prune's candidate lookup:
        // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-sync-engine-test-ts-L264
        if (sql.includes('SELECT id FROM stores WHERE _deleted = 0')) return [{ id: 'stale-store' }];
        if (sql.includes('SELECT 1 FROM')) return []; // both records are new inserts
        return [];
      }));

      await pullChanges();

      const executeMock = vi.mocked(execute);
      const pruneCall = executeMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('UPDATE stores SET _deleted = 1'),
      );

      expect(pruneCall).toBeDefined();
      // The prune is now aimed at the resolved candidates rather than
      // re-deriving them with a NOT IN over every id the server returned.
      expect(pruneCall?.[1]).toEqual(['stale-store']);
    });

    it('does not touch stores at all when the pull response has no stores key', async () => {
      vi.mocked(apiClient.pullChanges).mockResolvedValueOnce({
        success: true,
        changes: {
          products: [{ id: 'rec1', name: 'Ibuprofen', _version: 1, deleted_at: null }],
        },
        server_timestamp: '2026-07-21T00:00:00Z',
      });

      vi.mocked(query).mockImplementation(asAsync((sql: string) => {
        if (sql.includes('_sync_state')) return [];
        if (sql.includes('PRAGMA table_info')) return [{ name: 'id' }, { name: 'name' }, { name: '_version' }];
        if (sql.includes('SELECT 1 FROM')) return [];
        return [];
      }));

      await pullChanges();

      const executeMock = vi.mocked(execute);
      const touchedStores = executeMock.mock.calls.some(
        (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('stores'),
      );
      expect(touchedStores).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insert } from '../lib/db/base-helpers';
import { query, execute } from '../lib/db/core';

// Mock the core DB functions
vi.mock('../lib/db/core', async () => {
  const actual = await vi.importActual('../lib/db/core');
  return {
    ...actual as any,
    execute: vi.fn().mockResolvedValue(true),
    query: vi.fn(),
    logAction: vi.fn().mockResolvedValue(true),
  };
});

import { pushChanges } from '../lib/db/sync-engine/push';
import { pullChanges } from '../lib/db/sync-engine/pull';
import { apiClient } from '../lib/api/client';

// Mock local-database to force isTauri to true so it uses the execute() wrapper
vi.mock('../lib/db/local-database', async () => {
  const actual = await vi.importActual('../lib/db/local-database');
  return {
    ...actual as any,
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
      expect(executeMock.mock.calls[1][1][0]).toBe('products');
      expect(executeMock.mock.calls[1][1][2]).toBe('INSERT');
      expect(typeof executeMock.mock.calls[1][1][3]).toBe('string');
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

      vi.mocked(apiClient.pushChanges).mockResolvedValueOnce({ success: true } as any);
      
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
      } as any);

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
  });
});

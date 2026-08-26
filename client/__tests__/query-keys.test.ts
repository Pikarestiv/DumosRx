import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Query } from '@tanstack/react-query';
import { queryKeys } from '../lib/query-keys';

vi.mock('../lib/query-client', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('../lib/db/core', async () => {
  const actual = await vi.importActual<typeof import('../lib/db/core')>('../lib/db/core');
  return {
    ...actual,
    execute: vi.fn(),
    query: vi.fn(),
    logAction: vi.fn(),
  };
});

describe('queryKeys factory', () => {
  it('produces a queryKey + meta.tables pair for a single-table resource', () => {
    // Trailing [activeStoreId, currentUserId] suffix; see lib/query-keys.ts's
    // resource(). Both null here since no store/user is set in this test.
    const result = queryKeys.products.detail('prod-1');
    expect(result.queryKey).toEqual(['products', 'detail', 'prod-1', null, null]);
    expect(result.meta.tables).toEqual(['products']);
  });

  it('produces stable keys for repeated calls with the same args', () => {
    expect(queryKeys.customers.all()).toEqual(queryKeys.customers.all());
    expect(queryKeys.stockBatches.forProduct('p1')).toEqual(
      queryKeys.stockBatches.forProduct('p1'),
    );
  });

  it('produces distinct keys for different args', () => {
    const a = queryKeys.purchaseOrders.detail('po-1');
    const b = queryKeys.purchaseOrders.detail('po-2');
    expect(a.queryKey).not.toEqual(b.queryKey);
  });

  it('tags multi-table resources with every table they depend on', () => {
    const dashboard = queryKeys.dashboard.overview('user-1');
    expect(dashboard.meta.tables).toEqual(
      expect.arrayContaining(['sales', 'returns', 'stock_movements', 'purchase_orders', 'expenses', 'prescriptions', 'products']),
    );

    const bi = queryKeys.bi.metrics('this_month', 'last_month');
    expect(bi.meta.tables.length).toBeGreaterThan(1);
  });

  it('tags remote-API-backed resources with an empty tables array, not omitted', () => {
    const orders = queryKeys.onlineOrders.all();
    expect(orders.meta.tables).toEqual([]);

    const broadcasts = queryKeys.broadcasts.all('store-1');
    expect(broadcasts.meta.tables).toEqual([]);
  });
});

// --- Predicate-based invalidation ---
//
// Both base-helpers.ts (invalidateQueriesForTable) and the sync-engine pull
// handler build a `predicate` function and hand it to
// queryClient.invalidateQueries({ predicate }). We can't easily observe a
// real QueryClient's cache here, so instead we capture the predicate that
// was passed and exercise it directly against fake `Query`-shaped objects,
// the same way the real QueryClient would when walking its cache.
function fakeQuery(tables?: string[]): Query {
  return { meta: tables ? { tables } : undefined } as Query;
}

describe('base-helpers invalidateQueriesForTable predicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function getCapturedPredicate(table: string) {
    const { queryClient } = await import('../lib/query-client');
    const { execute, query, logAction } = await import('../lib/db/core');
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(logAction).mockResolvedValue(undefined);

    const { insert } = await import('../lib/db/base-helpers');
    await insert(table, { id: 'rec-1' });

    const call = vi.mocked(queryClient.invalidateQueries).mock.calls[0][0];
    return call?.predicate as (q: Query) => boolean;
  }

  it('invalidates a query tagged with the mutated table', async () => {
    const predicate = await getCapturedPredicate('products');
    expect(predicate(fakeQuery(['products']))).toBe(true);
  });

  it('does not invalidate a query tagged only with unrelated tables', async () => {
    const predicate = await getCapturedPredicate('products');
    expect(predicate(fakeQuery(['customers']))).toBe(false);
  });

  it('invalidates a query tagged with multiple tables if any of them match', async () => {
    const predicate = await getCapturedPredicate('stock_batches');
    expect(predicate(fakeQuery(['products', 'categories', 'stock_batches']))).toBe(true);
  });

  it('falls back to invalidating untagged (not-yet-migrated) queries', async () => {
    const predicate = await getCapturedPredicate('products');
    expect(predicate(fakeQuery(undefined))).toBe(true);
  });
});

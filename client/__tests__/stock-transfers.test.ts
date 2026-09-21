import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeStore {
  id: string;
  name: string;
}

interface FakeProduct {
  id: string;
  name: string;
  barcode?: string | null;
  category_id?: string | null;
  store_id: string;
  selling_price?: number;
  base_unit?: string;
  [key: string]: unknown;
}

interface FakeBatch {
  id: string;
  product_id: string;
  quantity: number;
  cost_price?: number | null;
  expiry_date?: string | null;
  created_at?: string;
  is_active?: number;
  store_id: string;
  _deleted?: number;
}

interface FakeMovement {
  id: string;
  product_id: string;
  stock_batch_id?: string;
  movement_type: string;
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  reference_id?: string;
  reference_type?: string;
  store_id?: string;
  performed_by?: string | null;
  [key: string]: unknown;
}

let stores: Record<string, FakeStore>;
let products: Record<string, FakeProduct>;
let batches: Record<string, FakeBatch>;
let movements: FakeMovement[];
let categories: Record<string, { id: string; name: string; store_id?: string }>;
let idCounter = 0;

function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// Fakes the query surface stock-transfers.ts actually issues, branching on
// distinguishing substrings the same way stock-audit.test.ts's fake does —
// stateful enough that the real FEFO deduction/weighted-average/auto-create
// logic runs against it, not just mock-call assertions.
vi.mock('@/lib/db/local-database', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM stores WHERE id = ?')) {
      const s = stores[params[0] as string];
      return s ? [s] : [];
    }
    if (sql.includes('FROM products WHERE id = ? AND _deleted = 0 AND store_id = ?')) {
      const p = products[params[0] as string];
      return p && p.store_id === params[1] ? [p] : [];
    }
    if (sql.includes('FROM stock_batches') && sql.includes('WHERE product_id = ?') && sql.includes('quantity > 0')) {
      return Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.quantity > 0 && !b._deleted)
        .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || '') || (a.created_at || '').localeCompare(b.created_at || ''));
    }
    if (sql.includes('FROM products WHERE barcode = ?')) {
      const found = Object.values(products).find(
        (p) => p.barcode === params[0] && p.store_id === params[1],
      );
      return found ? [{ id: found.id }] : [];
    }
    if (sql.includes('FROM categories WHERE id = ?')) {
      const c = categories[params[0] as string];
      return c ? [{ name: c.name }] : [];
    }
    if (sql.includes('FROM products p LEFT JOIN categories')) {
      const [name, categoryName, storeId] = params as string[];
      const found = Object.values(products).find(
        (p) =>
          p.name.toLowerCase() === name.toLowerCase() &&
          p.store_id === storeId &&
          categories[p.category_id || '']?.name.toLowerCase() === categoryName.toLowerCase(),
      );
      return found ? [{ id: found.id }] : [];
    }
    if (sql.includes('FROM products WHERE name = ? COLLATE NOCASE AND _deleted = 0 AND store_id = ?')) {
      const [name, storeId] = params as string[];
      const found = Object.values(products).find(
        (p) => p.name.toLowerCase() === name.toLowerCase() && p.store_id === storeId,
      );
      return found ? [{ id: found.id }] : [];
    }
    if (sql.includes('FROM categories WHERE name = ? COLLATE NOCASE')) {
      const [name, storeId] = params as string[];
      const found = Object.values(categories).find(
        (c) => c.name.toLowerCase() === (name as string).toLowerCase() && (c.store_id === storeId || !c.store_id),
      );
      return found ? [{ id: found.id }] : [];
    }
    return [];
  }),
  insert: vi.fn(async (table: string, data: Record<string, unknown>) => {
    const id = (data.id as string) || nextId(table);
    const record = { id, ...data };
    if (table === 'products') products[id] = record as unknown as FakeProduct;
    if (table === 'categories') categories[id] = record as unknown as { id: string; name: string; store_id?: string };
    if (table === 'stock_batches') batches[id] = record as unknown as FakeBatch;
    if (table === 'stock_movements') movements.push(record as FakeMovement);
    return id;
  }),
  update: vi.fn(
    async (
      table: string,
      id: string,
      data: Record<string, unknown>,
      _options?: { storeId?: string },
    ) => {
      if (table === 'stock_batches') batches[id] = { ...batches[id], ...data };
      if (table === 'products') products[id] = { ...products[id], ...data };
      return id;
    },
  ),
  transaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  generateId: vi.fn(() => nextId('transfer')),
}));

import { transferStock } from '@/lib/db/queries/stock-transfers';
import { update as mockedUpdate } from '@/lib/db/local-database';

describe('transferStock', () => {
  beforeEach(() => {
    stores = {
      s1: { id: 's1', name: 'Downtown Branch' },
      s2: { id: 's2', name: 'Uptown Branch' },
    };
    products = {};
    batches = {};
    movements = [];
    categories = {};
    idCounter = 0;
    vi.clearAllMocks();
  });

  it('happy path: moves stock, writes paired transfer_out/transfer_in rows, creates the destination product', async () => {
    products['p1'] = { id: 'p1', name: 'Paracetamol 500mg', barcode: 'B1', store_id: 's1', selling_price: 500, base_unit: 'Tablet' };
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 50, cost_price: 100, expiry_date: '2027-01-01', created_at: '2026-01-01', store_id: 's1' };

    const result = await transferStock({
      sourceStoreId: 's1',
      destStoreId: 's2',
      productId: 'p1',
      quantity: 20,
      performedBy: 'user-1',
    });

    expect(batches['b1'].quantity).toBe(30);
    expect(result.quantityTransferred).toBe(20);
    expect(result.averageCostPrice).toBe(100);

    const destProduct = products[result.destProductId];
    expect(destProduct).toMatchObject({ name: 'Paracetamol 500mg', store_id: 's2', selling_price: 500 });

    const destBatch = Object.values(batches).find((b) => b.product_id === result.destProductId);
    expect(destBatch).toMatchObject({ quantity: 20, cost_price: 100, store_id: 's2' });

    const out = movements.find((m) => m.movement_type === 'transfer_out');
    const inn = movements.find((m) => m.movement_type === 'transfer_in');
    expect(out).toMatchObject({ quantity: -20, store_id: 's1', reference_type: 'stock_transfer', unit_cost: 100 });
    expect(inn).toMatchObject({ quantity: 20, store_id: 's2', reference_type: 'stock_transfer', unit_cost: 100 });
    expect(out?.reference_id).toBe(inn?.reference_id);

    // Regression coverage for bug #8's fix: the source batch's quantity
    // deduction must pass an explicit storeId override (sourceStoreId)
    // rather than relying on - or mutating - the global active-store
    // resolver, which is what let a concurrent write elsewhere in the same
    // process land unscoped during a transfer. transferStock() no longer
    // imports lib/db/core at all, so there's nothing for it to touch even if
    // it wanted to; this asserts the *positive* replacement, not just the
    // absence of the old mechanism.
    expect(mockedUpdate).toHaveBeenCalledWith(
      'stock_batches',
      'b1',
      { quantity: 30 },
      { storeId: 's1' },
    );
  });

  it('rejects a transfer that exceeds available stock, writing nothing', async () => {
    products['p1'] = { id: 'p1', name: 'Amoxicillin', store_id: 's1' };
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 5, cost_price: 50, store_id: 's1' };

    await expect(
      transferStock({ sourceStoreId: 's1', destStoreId: 's2', productId: 'p1', quantity: 10, performedBy: 'user-1' }),
    ).rejects.toThrow(/Insufficient stock/);

    expect(batches['b1'].quantity).toBe(5);
    expect(movements).toHaveLength(0);
  });

  it('rejects source === destination', async () => {
    await expect(
      transferStock({ sourceStoreId: 's1', destStoreId: 's1', productId: 'p1', quantity: 1, performedBy: null }),
    ).rejects.toThrow(/must be different/);
  });

  it('rejects a non-positive quantity', async () => {
    products['p1'] = { id: 'p1', name: 'Vitamin C', store_id: 's1' };
    await expect(
      transferStock({ sourceStoreId: 's1', destStoreId: 's2', productId: 'p1', quantity: 0, performedBy: null }),
    ).rejects.toThrow(/greater than zero/);
  });

  it('increments the existing destination product/creates a new batch instead of duplicating the product', async () => {
    products['p1'] = { id: 'p1', name: 'Ibuprofen', barcode: 'B2', store_id: 's1' };
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 30, cost_price: 80, store_id: 's1' };

    // Same barcode already exists as a distinct product row on the dest store.
    products['p2'] = { id: 'p2', name: 'Ibuprofen', barcode: 'B2', store_id: 's2' };
    batches['existing-dest'] = { id: 'existing-dest', product_id: 'p2', quantity: 5, cost_price: 80, store_id: 's2' };

    const result = await transferStock({
      sourceStoreId: 's1',
      destStoreId: 's2',
      productId: 'p1',
      quantity: 10,
      performedBy: 'user-1',
    });

    expect(result.destProductId).toBe('p2'); // matched by barcode, not re-created
    expect(Object.values(products).filter((p) => p.name === 'Ibuprofen' && p.store_id === 's2')).toHaveLength(1);

    // A fresh batch is opened for the transferred quantity rather than
    // merged into the pre-existing dest batch (keeps FEFO/expiry lineage clean).
    const newBatches = Object.values(batches).filter((b) => b.product_id === 'p2' && b.id !== 'existing-dest');
    expect(newBatches).toHaveLength(1);
    expect(newBatches[0].quantity).toBe(10);
    expect(batches['existing-dest'].quantity).toBe(5); // untouched
  });

  it('draws FEFO across multiple source batches and weight-averages their cost onto one destination batch', async () => {
    products['p1'] = { id: 'p1', name: 'Cough Syrup', store_id: 's1' };
    // Soonest-expiring batch has only 5 units at cost 100; the rest must come
    // from the later-expiring batch at cost 130.
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 5, cost_price: 100, expiry_date: '2026-10-01', store_id: 's1' };
    batches['b2'] = { id: 'b2', product_id: 'p1', quantity: 20, cost_price: 130, expiry_date: '2027-05-01', store_id: 's1' };

    const result = await transferStock({
      sourceStoreId: 's1',
      destStoreId: 's2',
      productId: 'p1',
      quantity: 15,
      performedBy: 'user-1',
    });

    expect(batches['b1'].quantity).toBe(0); // fully drained first (FEFO)
    expect(batches['b2'].quantity).toBe(10); // remaining 10 came off the later batch

    // weighted average: (5*100 + 10*130) / 15 = 120
    expect(result.averageCostPrice).toBeCloseTo(120, 5);

    const destBatch = Object.values(batches).find((b) => b.product_id === result.destProductId);
    expect(destBatch?.cost_price).toBeCloseTo(120, 5);
    expect(destBatch?.expiry_date).toBe('2026-10-01'); // earliest of the two drawn batches

    const outRows = movements.filter((m) => m.movement_type === 'transfer_out');
    expect(outRows).toHaveLength(2); // one row per source batch touched
    expect(outRows.find((m) => m.stock_batch_id === 'b1')).toMatchObject({ quantity: -5, unit_cost: 100 });
    expect(outRows.find((m) => m.stock_batch_id === 'b2')).toMatchObject({ quantity: -10, unit_cost: 130 });

    // Every batch drawn from in the FEFO loop gets the same sourceStoreId
    // override, not just the first one.
    expect(mockedUpdate).toHaveBeenCalledWith('stock_batches', 'b1', { quantity: 0 }, { storeId: 's1' });
    expect(mockedUpdate).toHaveBeenCalledWith('stock_batches', 'b2', { quantity: 10 }, { storeId: 's1' });
  });

  it('throws when the product does not exist in the source store', async () => {
    await expect(
      transferStock({ sourceStoreId: 's1', destStoreId: 's2', productId: 'missing', quantity: 1, performedBy: null }),
    ).rejects.toThrow(/Product not found/);
  });

  it('throws when either store does not exist', async () => {
    products['p1'] = { id: 'p1', name: 'Paracetamol', store_id: 's1' };
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 10, cost_price: 50, store_id: 's1' };

    await expect(
      transferStock({ sourceStoreId: 's1', destStoreId: 'ghost', productId: 'p1', quantity: 1, performedBy: null }),
    ).rejects.toThrow(/Destination store not found/);

    await expect(
      transferStock({ sourceStoreId: 'ghost', destStoreId: 's2', productId: 'p1', quantity: 1, performedBy: null }),
    ).rejects.toThrow(/Source store not found/);
  });
});

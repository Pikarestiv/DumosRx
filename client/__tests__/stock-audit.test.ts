import { describe, it, expect, vi, beforeEach } from 'vitest';

/** In-memory fake for stock_batches / stock_movements / stock_audits so
 * submitStockAudit's real reconciliation logic (FEFO deduction, new-batch
 * creation, quantity math) runs against something stateful, instead of
 * asserting on mock call args alone — this is what would have caught the
 * double-delta bug in the old updateStockBatchQuantity. */
let batches: Record<string, any>;
let movements: any[];
let audits: any[];

vi.mock('@/lib/db/local-database', () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('SELECT quantity FROM stock_batches WHERE id = ?')) {
      const b = batches[params[0]];
      return b ? [{ quantity: b.quantity }] : [];
    }
    if (sql.includes('FROM stock_batches WHERE product_id = ?')) {
      return Object.values(batches)
        .filter((b: any) => b.product_id === params[0] && b.quantity > 0)
        .sort((a: any, b: any) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
    }
    return [];
  }),
  insert: vi.fn(async (table: string, data: any) => {
    const id = data.id || `${table}-${Math.random()}`;
    const record = { id, ...data };
    if (table === 'stock_batches') batches[id] = record;
    if (table === 'stock_movements') movements.push(record);
    if (table === 'stock_audits') audits.push(record);
    return id;
  }),
  update: vi.fn(async (table: string, id: string, data: any) => {
    if (table === 'stock_batches') batches[id] = { ...batches[id], ...data };
    return id;
  }),
}));

import { submitStockAudit } from '@/lib/db/queries/inventory';

describe('submitStockAudit (Cycle Count persistence)', () => {
  beforeEach(() => {
    batches = {};
    movements = [];
    audits = [];
    vi.clearAllMocks();
  });

  it('skips items where the count matches the system quantity', async () => {
    await submitStockAudit(
      [{ productId: 'p1', systemQty: 10, countedQty: 10 }],
      'user-1',
    );
    expect(movements).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('adds found stock to the soonest-expiring existing batch', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 20, expiry_date: '2027-01-01' };

    await submitStockAudit(
      [{ productId: 'p1', systemQty: 20, countedQty: 35, reason: 'Found' }],
      'user-1',
    );

    expect(batches['b1'].quantity).toBe(35); // 20 + 15, not 20 + 2*15
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ movement_type: 'adjustment', quantity: 15, stock_batch_id: 'b1' });
    expect(audits[0]).toMatchObject({ expected_quantity: 20, actual_quantity: 35, difference: 15 });
  });

  it('opens a new batch when found stock has nowhere to go (product had zero batches)', async () => {
    await submitStockAudit(
      [{ productId: 'p1', systemQty: 0, countedQty: 12, reason: 'Found' }],
      'user-1',
    );

    const created = Object.values(batches).find((b: any) => b.product_id === 'p1') as any;
    expect(created.quantity).toBe(12);
    expect(movements[0]).toMatchObject({ movement_type: 'adjustment', quantity: 12 });
  });

  it('deducts shrinkage from a single batch when it has enough stock', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 50, expiry_date: '2027-01-01' };

    await submitStockAudit(
      [{ productId: 'p1', systemQty: 50, countedQty: 42, reason: 'Damaged' }],
      'user-1',
    );

    expect(batches['b1'].quantity).toBe(42);
    expect(movements[0]).toMatchObject({ quantity: -8 });
  });

  it('deducts shrinkage FEFO across multiple batches when one is not enough', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 5, expiry_date: '2026-09-01' };
    batches['b2'] = { id: 'b2', product_id: 'p1', quantity: 20, expiry_date: '2027-03-01' };

    // System says 25, counted 10 -> 15 missing. Soonest-expiring batch (b1,
    // qty 5) gets fully zeroed first, remaining 10 comes off b2.
    await submitStockAudit(
      [{ productId: 'p1', systemQty: 25, countedQty: 10, reason: 'Missing' }],
      'user-1',
    );

    expect(batches['b1'].quantity).toBe(0);
    expect(batches['b2'].quantity).toBe(10);
    expect(movements).toHaveLength(2);
    expect(movements.find((m) => m.stock_batch_id === 'b1')?.quantity).toBe(-5);
    expect(movements.find((m) => m.stock_batch_id === 'b2')?.quantity).toBe(-10);
  });

  it('never drives a batch quantity negative', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 3, expiry_date: '2027-01-01' };

    // Counted 0 but system batches only cover 3 units total (data was
    // already inconsistent) — deduction should stop at what's available.
    await submitStockAudit(
      [{ productId: 'p1', systemQty: 3, countedQty: 0 }],
      'user-1',
    );

    expect(batches['b1'].quantity).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeBatch {
  id: string;
  product_id: string;
  quantity: number;
  expiry_date?: string;
  is_active?: number;
  cost_price?: number;
}

interface FakeMovement {
  id: string;
  stock_batch_id?: string;
  movement_type?: string;
  quantity?: number;
  [key: string]: unknown;
}

/** Same in-memory fake as stock-audit.test.ts: submitStockAdjustment shares
 * the audit's FEFO deduction / restock-target logic, so the quick-adjust
 * flow has to be exercised against real stateful quantity maths rather than
 * mock call args. */
let batches: Record<string, FakeBatch>;
let movements: FakeMovement[];
let audits: Record<string, unknown>[];

const FAR_EXPIRY = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const NEAR_EXPIRY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const PAST_EXPIRY = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function isExpired(b: FakeBatch): boolean {
  return !!b.expiry_date && new Date(b.expiry_date).getTime() < Date.now();
}

vi.mock('@/lib/db/local-database', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    const normSql = sql.replace(/\s+/g, ' ').trim();
    if (normSql.includes('SELECT quantity FROM stock_batches WHERE id = ?')) {
      const b = batches[params[0] as string];
      return b ? [{ quantity: b.quantity }] : [];
    }
    if (normSql.startsWith('SELECT COALESCE(SUM(quantity)')) {
      const qty = Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.is_active !== 0)
        .reduce((sum, b) => sum + b.quantity, 0);
      return [{ qty }];
    }
    if (normSql.includes('is_active = 1 AND quantity > 0')) {
      return Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.quantity > 0 && b.is_active !== 0 && !isExpired(b))
        .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
    }
    if (normSql.includes('ORDER BY updated_at DESC')) {
      return Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.is_active !== 0)
        .slice(0, 1);
    }
    if (normSql.includes('FROM stock_batches') && normSql.includes('WHERE product_id = ?')) {
      return Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.is_active !== 0 && !isExpired(b))
        .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
    }
    return [];
  }),
  insert: vi.fn(async (table: string, data: Record<string, unknown>) => {
    const id = (data.id as string) || `${table}-${movements.length}-${Math.random()}`;
    const record = { id, ...data };
    if (table === 'stock_batches') batches[id] = record as unknown as FakeBatch;
    if (table === 'stock_movements') movements.push(record as FakeMovement);
    if (table === 'stock_audits') audits.push(record);
    return id;
  }),
  update: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
    if (table === 'stock_batches') batches[id] = { ...batches[id], ...data };
    return id;
  }),
  transaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { submitStockAdjustment } from '@/lib/db/queries/inventory';
import { resolveAdjustmentDelta } from '@/components/stock-batch/adjustment-derivations';

describe('submitStockAdjustment (quick Adjust Stock persistence)', () => {
  beforeEach(() => {
    batches = {};
    movements = [];
    audits = [];
    vi.clearAllMocks();
  });

  it('writes every touched item under one shared reference_id', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 20, expiry_date: FAR_EXPIRY };
    batches['b2'] = { id: 'b2', product_id: 'p2', quantity: 30, expiry_date: FAR_EXPIRY };

    const referenceId = await submitStockAdjustment(
      [
        { productId: 'p1', delta: -5 },
        { productId: 'p2', delta: -3 },
      ],
      { reason: 'Damage', performedBy: 'user-1' },
    );

    expect(movements).toHaveLength(2);
    expect(new Set(movements.map((m) => m.reference_id))).toEqual(new Set([referenceId]));
    expect(referenceId).toBeTruthy();
  });

  it('tags its movements as stock_adjustment, distinct from a cycle count', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 20, expiry_date: FAR_EXPIRY };

    await submitStockAdjustment([{ productId: 'p1', delta: -5 }], {
      reason: 'Loss',
      performedBy: 'user-1',
    });

    expect(movements[0]).toMatchObject({
      movement_type: 'adjustment',
      reference_type: 'stock_adjustment',
      reason: 'Loss',
      performed_by: 'user-1',
    });
    expect(audits).toHaveLength(0);
  });

  it('deducts a removal FEFO across batches, soonest expiry first', async () => {
    batches['soon'] = { id: 'soon', product_id: 'p1', quantity: 4, expiry_date: NEAR_EXPIRY };
    batches['later'] = { id: 'later', product_id: 'p1', quantity: 10, expiry_date: FAR_EXPIRY };

    await submitStockAdjustment([{ productId: 'p1', delta: -6 }], {
      reason: 'Damage',
      performedBy: 'user-1',
    });

    expect(batches['soon'].quantity).toBe(0);
    expect(batches['later'].quantity).toBe(8);
    expect(movements.map((m) => m.quantity).sort((a, b) => Number(a) - Number(b))).toEqual([-4, -2]
      .sort((a, b) => a - b));
  });

  it('still records the remainder when a removal exceeds every tracked batch', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 3, expiry_date: FAR_EXPIRY };

    await submitStockAdjustment([{ productId: 'p1', delta: -10 }], {
      reason: 'Loss',
      performedBy: 'user-1',
    });

    expect(batches['b1'].quantity).toBe(0);
    const total = movements.reduce((sum, m) => sum + Number(m.quantity), 0);
    expect(total).toBe(-10);
  });

  it('adds received stock to the soonest-expiring existing batch', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 20, expiry_date: FAR_EXPIRY };

    await submitStockAdjustment([{ productId: 'p1', delta: 15, unitCost: 40 }], {
      reason: 'Receive items',
      performedBy: 'user-1',
    });

    expect(batches['b1'].quantity).toBe(35);
    expect(movements[0]).toMatchObject({ quantity: 15, unit_cost: 40, total_cost: 600 });
  });

  it('opens a fresh batch rather than restocking an expired one', async () => {
    batches['expired'] = { id: 'expired', product_id: 'p1', quantity: 5, expiry_date: PAST_EXPIRY };

    await submitStockAdjustment([{ productId: 'p1', delta: 8, unitCost: 10 }], {
      reason: 'Receive items',
      performedBy: 'user-1',
    });

    expect(batches['expired'].quantity).toBe(5);
    const fresh = Object.values(batches).find((b) => b.product_id === 'p1' && b.id !== 'expired');
    expect(fresh?.quantity).toBe(8);
  });

  it('skips items with a zero delta', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 20, expiry_date: FAR_EXPIRY };

    await submitStockAdjustment([{ productId: 'p1', delta: 0 }], {
      reason: 'Inventory count',
      performedBy: 'user-1',
    });

    expect(movements).toHaveLength(0);
    expect(batches['b1'].quantity).toBe(20);
  });

  it('reduces stock FEFO when an inventory count comes in under the system quantity', async () => {
    batches['soon'] = { id: 'soon', product_id: 'p1', quantity: 4, expiry_date: NEAR_EXPIRY };
    batches['later'] = { id: 'later', product_id: 'p1', quantity: 4, expiry_date: FAR_EXPIRY };

    const countedQuantity = 5;
    const currentStock = 8;

    await submitStockAdjustment(
      [
        {
          productId: 'p1',
          delta: resolveAdjustmentDelta('inventory_count', countedQuantity, currentStock),
        },
      ],
      { reason: 'Inventory count', performedBy: 'user-1' },
    );

    expect(batches['soon'].quantity).toBe(1);
    expect(batches['later'].quantity).toBe(4);
    const onHand = batches['soon'].quantity + batches['later'].quantity;
    expect(onHand).toBe(countedQuantity);
  });

  it('refuses to record an adjustment with no performing user', async () => {
    await expect(
      submitStockAdjustment([{ productId: 'p1', delta: -1 }], {
        reason: 'Loss',
        performedBy: null,
      }),
    ).rejects.toThrow(/performing user/i);
    expect(movements).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeBatch {
  id: string;
  product_id: string;
  quantity: number;
  expiry_date?: string;
  is_active?: number;
}

interface FakeMovement {
  id: string;
  stock_batch_id?: string;
  movement_type?: string;
  quantity?: number;
  [key: string]: unknown;
}

interface FakeAudit {
  id: string;
  expected_quantity?: number;
  actual_quantity?: number;
  difference?: number;
  [key: string]: unknown;
}

// In-memory fake for stock_batches / stock_movements / stock_audits so submitStockAudit's real reconciliation logic (FEFO…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-stock-audit-test-ts-L27
let batches: Record<string, FakeBatch>;
let movements: FakeMovement[];
let audits: FakeAudit[];

// Relative to "now" so these stay unexpired as real time passes -
// getBatchesForProduct excludes already-expired batches from FEFO picking.
const NEAR_EXPIRY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const FAR_EXPIRY = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const PAST_EXPIRY = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function isExpired(b: FakeBatch): boolean {
  return !!b.expiry_date && new Date(b.expiry_date).getTime() < Date.now();
}

vi.mock('@/lib/db/local-database', async () => {
  const { applyMovementToFakeBatch } = await import('./helpers/fake-batch-quantity');
  const { asAsync } = await import('./helpers/as-async');
  return {
  query: vi.fn(asAsync((sql: string, params: unknown[] = []) => {
    // Whitespace-normalized so this stays robust to multi-line SQL formatting in the real queries (getBatchesForProduct / getA…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-stock-audit-test-ts-L50
    const normSql = sql.replace(/\s+/g, ' ').trim();
    if (normSql.includes('SELECT quantity FROM stock_batches WHERE id = ?')) {
      const b = batches[params[0] as string];
      return b ? [{ quantity: b.quantity }] : [];
    }
    if (normSql.startsWith('SELECT COALESCE(SUM(quantity)')) {
      // getProductStockQuantity:
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-stock-audit-test-ts-L59
      const qty = Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.is_active !== 0)
        .reduce((sum, b) => sum + b.quantity, 0);
      return [{ qty }];
    }
    if (normSql.includes('is_active = 1 AND quantity > 0')) {
      // getBatchesForProduct: only active, non-expired batches with real
      // remaining quantity - matches the FEFO sale/deduction convention.
      return Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.quantity > 0 && b.is_active !== 0 && !isExpired(b))
        .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
    }
    if (normSql.includes('FROM stock_batches') && normSql.includes('WHERE product_id = ?')) {
      // getAllActiveBatchesForProduct:
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-stock-audit-test-ts-L77
      return Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.is_active !== 0 && !isExpired(b))
        .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
    }
    return [];
  })),
  insert: vi.fn(asAsync((table: string, data: Record<string, unknown>) => {
    const id = (data.id as string) || `${table}-${Math.random()}`;
    const record = { id, ...data };
    if (table === 'stock_batches') batches[id] = record as unknown as FakeBatch;
    if (table === 'stock_movements') movements.push(record as FakeMovement);
    if (table === 'stock_movements') applyMovementToFakeBatch(batches, movements, data);
    if (table === 'stock_audits') audits.push(record as FakeAudit);
    return id;
  })),
  update: vi.fn(asAsync((table: string, id: string, data: Record<string, unknown>) => {
    if (table === 'stock_batches') batches[id] = { ...batches[id], ...data };
    return id;
  })),
  transaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  };
});

import { submitStockAudit } from '@/lib/db/queries/inventory';

describe('submitStockAudit (Cycle Count persistence)', () => {
  beforeEach(() => {
    batches = {};
    movements = [];
    audits = [];
    vi.clearAllMocks();
  });

  it('skips items where the count matches the system quantity', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 10, expiry_date: FAR_EXPIRY };

    await submitStockAudit(
      [{ productId: 'p1', systemQty: 10, baselineQty: 10, countedQty: 10 }],
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

  it('never lands found stock in an expired or deactivated batch (KNOWN_BUGS.md - stock audit restock into expired/deactivated batch)', async () => {
    // Product's only existing batches are expired and deactivated - both
    // must be skipped as restock targets, even though quantity math alone
    // would happily add to either. A fresh batch should be opened instead.
    batches['expired'] = { id: 'expired', product_id: 'p1', quantity: 5, expiry_date: PAST_EXPIRY };
    batches['inactive'] = { id: 'inactive', product_id: 'p1', quantity: 5, expiry_date: FAR_EXPIRY, is_active: 0 };

    await submitStockAudit(
      [{ productId: 'p1', systemQty: 10, baselineQty: 10, countedQty: 25, reason: 'Found', systemCostPrice: 40 }],
      'user-1',
    );

    // Neither pre-existing batch was touched.
    expect(batches['expired'].quantity).toBe(5);
    expect(batches['inactive'].quantity).toBe(5);

    // The found 15 units landed in a brand-new batch, valued at the known
    // unit cost rather than left at 0.
    const newBatch = Object.values(batches).find(
      (b) => b.product_id === 'p1' && b.id !== 'expired' && b.id !== 'inactive',
    ) as (FakeBatch & { cost_price?: number }) | undefined;
    expect(newBatch?.quantity).toBe(15);
    expect(newBatch?.cost_price).toBe(40);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ movement_type: 'adjustment', quantity: 15 });
  });

  it('opens a new batch when found stock has nowhere to go (product had zero batches)', async () => {
    await submitStockAudit(
      [{ productId: 'p1', systemQty: 0, countedQty: 12, reason: 'Found' }],
      'user-1',
    );

    const created = Object.values(batches).find((b) => b.product_id === 'p1');
    expect(created?.quantity).toBe(12);
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

  it('records unit_cost/total_cost on adjustment movements (KNOWN_BUGS.md #4)', async () => {
    // Regression: without these fields, getStockMoM()'s 30-day added/
    // removed-value sums (SUM(ABS(quantity) * IFNULL(unit_cost, 0))) treated
    // every cycle-count adjustment as ₦0 impact, regardless of real cost.
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 50, expiry_date: '2027-01-01' };

    await submitStockAudit(
      [{ productId: 'p1', systemQty: 50, countedQty: 42, systemCostPrice: 200, reason: 'Damaged' }],
      'user-1',
    );

    expect(movements[0]).toMatchObject({ quantity: -8, unit_cost: 200, total_cost: 1600 });
  });

  it('uses the counted cost price over the system one when both are given', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 20, expiry_date: '2027-01-01' };

    await submitStockAudit(
      [
        {
          productId: 'p1',
          systemQty: 20,
          countedQty: 35,
          systemCostPrice: 100,
          countedCostPrice: 150,
          reason: 'Found',
        },
      ],
      'user-1',
    );

    expect(movements[0]).toMatchObject({ quantity: 15, unit_cost: 150, total_cost: 2250 });
  });

  it('treats an uncounted quantity as unchanged, so a price-only correction cannot post NaN stock', async () => {
    // Counted Qty opens empty, so a row where the counter only fixed the
    // cost price reaches here with no countedQty at all. A bare
    // `countedQty - currentSystemQty` makes that NaN, which passes every
    // `=== 0` guard and arrives at applyStockAdjustmentDelta as the delta.
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 20, expiry_date: FAR_EXPIRY };

    await submitStockAudit(
      [
        {
          productId: 'p1',
          systemQty: 20,
          systemCostPrice: 100,
          countedCostPrice: 150,
          reason: 'Cost correction',
        },
      ],
      'user-1',
    );

    // The price correction landed...
    expect(batches['b1'].quantity).toBe(20);
    expect((batches['b1'] as FakeBatch & { cost_price?: number }).cost_price).toBe(150);
    // ...and no stock moved, with the audit row recording a real quantity.
    expect(movements).toHaveLength(0);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      expected_quantity: 20,
      actual_quantity: 20,
      difference: 0,
    });
    expect(Number.isNaN(audits[0].difference as number)).toBe(false);
  });

  it('deducts shrinkage FEFO across multiple batches when one is not enough', async () => {
    batches['b1'] = { id: 'b1', product_id: 'p1', quantity: 5, expiry_date: NEAR_EXPIRY };
    batches['b2'] = { id: 'b2', product_id: 'p1', quantity: 20, expiry_date: FAR_EXPIRY };

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
    // already inconsistent); deduction should stop at what's available.
    await submitStockAudit(
      [{ productId: 'p1', systemQty: 3, countedQty: 0 }],
      'user-1',
    );

    expect(batches['b1'].quantity).toBe(0);
  });
});

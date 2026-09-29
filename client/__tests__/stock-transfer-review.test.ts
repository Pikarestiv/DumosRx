import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeMovement {
  id: string;
  reference_id: string | null;
  reference_type: string | null;
  movement_type: string;
  store_id: string;
  status: string | null;
  _deleted?: number;
}

let movements: FakeMovement[];

vi.mock('@/lib/db/local-database', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM stock_movements') && sql.includes('status =')) {
      const [referenceId, referenceType] = params as string[];
      return movements
        .filter(
          (m) =>
            m.reference_id === referenceId &&
            m.reference_type === referenceType &&
            m.status === 'needs_review' &&
            !m._deleted,
        )
        .map((m) => ({ id: m.id, store_id: m.store_id }));
    }
    return [];
  }),
  update: vi.fn(
    async (
      table: string,
      id: string,
      data: Record<string, unknown>,
      _options?: { storeId?: string },
    ) => {
      if (table !== 'stock_movements') return;
      const row = movements.find((m) => m.id === id);
      if (row) Object.assign(row, data);
    },
  ),
}));

import {
  markStockTransferReviewed,
  STOCK_TRANSFER_REVIEWED_STATUS,
} from '@/lib/db/queries/stock-transfers';
import { update as mockedUpdate } from '@/lib/db/local-database';

function flaggedTransfer(referenceId: string): FakeMovement[] {
  return [
    {
      id: `${referenceId}-out`,
      reference_id: referenceId,
      reference_type: 'stock_transfer',
      movement_type: 'transfer_out',
      store_id: 's1',
      status: 'needs_review',
    },
    {
      id: `${referenceId}-in`,
      reference_id: referenceId,
      reference_type: 'stock_transfer',
      movement_type: 'transfer_in',
      store_id: 's2',
      status: 'needs_review',
    },
  ];
}

describe('markStockTransferReviewed', () => {
  beforeEach(() => {
    movements = [];
    vi.clearAllMocks();
  });

  it('clears the needs_review flag on BOTH legs of the transfer, not just the one opened', async () => {
    movements = flaggedTransfer('t1');

    const cleared = await markStockTransferReviewed('t1');

    expect(cleared).toBe(2);
    expect(movements.map((m) => m.status)).toEqual([
      STOCK_TRANSFER_REVIEWED_STATUS,
      STOCK_TRANSFER_REVIEWED_STATUS,
    ]);
  });

  it('updates each leg under its OWN store id, since the two legs live in different stores', async () => {
    movements = flaggedTransfer('t1');

    await markStockTransferReviewed('t1');

    expect(mockedUpdate).toHaveBeenCalledWith(
      'stock_movements',
      't1-out',
      { status: STOCK_TRANSFER_REVIEWED_STATUS },
      { storeId: 's1' },
    );
    expect(mockedUpdate).toHaveBeenCalledWith(
      'stock_movements',
      't1-in',
      { status: STOCK_TRANSFER_REVIEWED_STATUS },
      { storeId: 's2' },
    );
  });

  it('leaves other transfers, and the rest of the immutable ledger, untouched', async () => {
    movements = [
      ...flaggedTransfer('t1'),
      ...flaggedTransfer('t2'),
      {
        id: 'sale-1',
        reference_id: 'sale-ref',
        reference_type: 'sale',
        movement_type: 'sale',
        store_id: 's1',
        status: null,
      },
    ];

    await markStockTransferReviewed('t1');

    expect(movements.find((m) => m.id === 't2-out')?.status).toBe('needs_review');
    expect(movements.find((m) => m.id === 't2-in')?.status).toBe('needs_review');
    expect(movements.find((m) => m.id === 'sale-1')?.status).toBeNull();
  });

  it('is idempotent: reviewing an already-reviewed transfer writes nothing and reports zero', async () => {
    movements = flaggedTransfer('t1');
    await markStockTransferReviewed('t1');
    vi.clearAllMocks();

    const cleared = await markStockTransferReviewed('t1');

    expect(cleared).toBe(0);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('marks the transfer reviewed rather than blanking the status, so the flag stays on the record', async () => {
    movements = flaggedTransfer('t1');

    await markStockTransferReviewed('t1');

    expect(STOCK_TRANSFER_REVIEWED_STATUS).toBe('reviewed');
    expect(movements.every((m) => m.status !== null)).toBe(true);
  });

  it('rejects an empty transfer id instead of scanning the whole ledger', async () => {
    await expect(markStockTransferReviewed('')).rejects.toThrow();
  });
});

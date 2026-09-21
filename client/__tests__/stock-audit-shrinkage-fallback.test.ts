import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeBatch {
  id: string;
  product_id: string;
  quantity: number;
  expiry_date?: string;
  updated_at?: string;
}

interface FakeMovement {
  id: string;
  stock_batch_id?: string;
  movement_type?: string;
  quantity?: number;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Regression: submitStockAudit's shrinkage branch deducted FEFO across
 * active (quantity > 0) batches until the counted shortfall was covered -
 * but if the product's system quantity was spread thinner across batches
 * than the recorded shortfall (e.g. every batch shows less stock than the
 * audit says is missing, a real scenario when batches were previously
 * miscounted), the loop simply ran out of batches and silently dropped the
 * remainder: no stock_movements record, and the batches' summed quantity
 * afterward doesn't match what the audit itself just reconciled to.
 * recordSaleItemStock already guards against the equivalent situation for a
 * sale (getAnyActiveBatchForProduct fallback); the audit path had no
 * equivalent until this fix.
 */
let batches: Record<string, FakeBatch>;
let movements: FakeMovement[];

vi.mock("@/lib/db/local-database", () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("SELECT quantity FROM stock_batches WHERE id = ?")) {
      const b = batches[params[0] as string];
      return b ? [{ quantity: b.quantity }] : [];
    }
    if (sql.includes("ORDER BY updated_at DESC")) {
      // getAnyActiveBatchForProduct: any batch regardless of quantity.
      const match = Object.values(batches)
        .filter((b) => b.product_id === params[0])
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
      return match.slice(0, 1);
    }
    if (sql.includes("is_active = 1 AND quantity > 0")) {
      // getBatchesForProduct: only batches with real remaining quantity.
      return Object.values(batches)
        .filter((b) => b.product_id === params[0] && b.quantity > 0)
        .sort((a, b) => (a.expiry_date || "").localeCompare(b.expiry_date || ""));
    }
    return [];
  }),
  insert: vi.fn(async (table: string, data: Record<string, unknown>) => {
    const id = (data.id as string) || `${table}-${Math.random()}`;
    const record = { id, ...data };
    if (table === "stock_batches") batches[id] = record as unknown as FakeBatch;
    if (table === "stock_movements") movements.push(record as FakeMovement);
    return id;
  }),
  update: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
    if (table === "stock_batches") batches[id] = { ...batches[id], ...data };
    return id;
  }),
  transaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { submitStockAudit } from "@/lib/db/queries/inventory";

describe("submitStockAudit - shrinkage exceeding every active batch's quantity", () => {
  beforeEach(() => {
    batches = {};
    movements = [];
    vi.clearAllMocks();
  });

  it("falls back to the most recently touched batch instead of silently dropping the remainder", async () => {
    // System says 10 on hand, but the one active batch only actually shows
    // 3 (an earlier miscount) - a 10-unit shortfall can't be fully covered
    // by FEFO deduction across active batches alone.
    batches["batchA"] = {
      id: "batchA",
      product_id: "p1",
      quantity: 3,
      updated_at: "2026-01-01",
    };

    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, countedQty: 0 }],
      "user-1",
    );

    // batchA's own 3 units were deducted via the normal FEFO loop.
    expect(batches["batchA"].quantity).toBe(0);

    // The remaining 7 units of shortfall must still be recorded somewhere,
    // not silently dropped - the fallback attributes it to batchA (the only
    // active batch). updateStockBatchQuantity clamps a batch's own quantity
    // at 0 (it never goes negative), but the stock_movements record still
    // reflects the full requested deduction, so the shortfall is traceable
    // even though the batch row itself bottoms out at 0.
    const adjustmentMovements = movements.filter((m) => m.movement_type === "adjustment");
    const totalDeducted = adjustmentMovements.reduce(
      (sum, m) => sum + Math.abs(m.quantity || 0),
      0,
    );
    expect(totalDeducted).toBe(10);
    expect(adjustmentMovements).toHaveLength(2);
    expect(batches["batchA"].quantity).toBe(0);
  });

  it("does nothing extra when the shortfall is fully covered by active batches", async () => {
    batches["batchA"] = {
      id: "batchA",
      product_id: "p1",
      quantity: 10,
      updated_at: "2026-01-01",
    };

    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, countedQty: 4 }],
      "user-1",
    );

    expect(batches["batchA"].quantity).toBe(4);
    const adjustmentMovements = movements.filter((m) => m.movement_type === "adjustment");
    expect(adjustmentMovements).toHaveLength(1);
  });
});

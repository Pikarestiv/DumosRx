import { query } from "../core";

export interface StockFingerprint {
  batch_count: number;
  quantity_sum: number;
  /** Valued at cost, over the same rows `batch_count` counts. */
  value_sum: number;
}

/**
 * What this device believes about its stock: how many batches, how many units,
 * and what they are worth at cost. The server compares these against what it
 * derives itself, so a divergence between two devices of one store is visible
 * without anyone counting shelves. See docs/superpowers/specs/2026-10-07-stuck-data-and-
 * divergence-visibility-design.md, Phase 1.
 */
export async function buildStockFingerprint(storeId: string | null): Promise<StockFingerprint | null> {
  if (!storeId) {
    return null;
  }

  try {
    const rows = await query<{
      batch_count: number;
      quantity_sum: number | null;
      value_sum: number | null;
    }>(
      `SELECT COUNT(*) AS batch_count,
              COALESCE(SUM(quantity), 0) AS quantity_sum,
              COALESCE(SUM(quantity * COALESCE(cost_price, 0)), 0) AS value_sum
       FROM stock_batches
       WHERE store_id = ? AND (_deleted = 0 OR _deleted IS NULL)`,
      [storeId],
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      batch_count: Number(rows[0].batch_count ?? 0),
      quantity_sum: Number(rows[0].quantity_sum ?? 0),
      value_sum: Number(rows[0].value_sum ?? 0),
    };
  } catch (err) {
    // Reporting must never be able to fail a sync.
    console.warn("[Sync] Could not build stock fingerprint", err);
    return null;
  }
}

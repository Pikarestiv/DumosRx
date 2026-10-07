import { query, getActiveStoreId } from "../core";

export interface StockFingerprint {
  batch_count: number;
  quantity_sum: number;
}

/**
 * Two integers describing what this device believes about its stock. The
 * server compares them against the value it derives from stock_movements, so
 * a divergence between two devices of one store is visible without anyone
 * counting shelves. See docs/superpowers/specs/2026-10-07-stuck-data-and-
 * divergence-visibility-design.md, Phase 1.
 */
export async function buildStockFingerprint(): Promise<StockFingerprint | null> {
  const storeId = getActiveStoreId();

  if (!storeId) {
    return null;
  }

  try {
    const rows = await query<{ batch_count: number; quantity_sum: number | null }>(
      `SELECT COUNT(*) AS batch_count, COALESCE(SUM(quantity), 0) AS quantity_sum
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
    };
  } catch (err) {
    // Reporting must never be able to fail a sync.
    console.warn("[Sync] Could not build stock fingerprint", err);
    return null;
  }
}

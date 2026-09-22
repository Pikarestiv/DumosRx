import { insert, update, query } from "@/lib/db/local-database";
import { getSaleItemBatches } from "@/lib/db/queries/sales";
import { getStockBatchById, getOrCreateTargetBatchForProduct } from "@/lib/db/queries/inventory";

interface RestoreParams {
  saleItemId: string;
  productId: string;
  costPrice: number;
  legacyStockBatchId?: string | null;
  returnQuantity: number;
  returnId: string;
  /** The parent sale, used to scope how much of this product's per-batch
   * split a *prior* return already restored (see the comment in
   * restoreReturnedStock below). Optional only for callers that predate
   * this field - omitting it disables the already-returned-quantity netting
   * and restores the old (buggy on a second partial return) behavior. */
  saleId?: string;
  performedBy?: string | null;
}

/** How much of each of this sale_item's original per-batch split has
 * already been restored by an *earlier* return of the same product within
 * the same sale. Scoped to `saleId` (not just `productId`) so a return of
 * the same product from a *different* sale that happens to share a batch
 * (routine under FEFO) is never counted - and to `saleId` rather than
 * `saleItemId` directly because return_items has no sale_item_id column;
 * this is safe because the POS cart merges duplicate products into one
 * line, so at most one sale_item per product exists within a given sale. */
async function getAlreadyRestoredByBatch(
  productId: string,
  saleId: string,
  excludeReturnId: string,
): Promise<Map<string, number>> {
  const rows = await query<{ stock_batch_id: string | null; restored: number }>(
    `SELECT sm.stock_batch_id as stock_batch_id, SUM(sm.quantity) as restored
     FROM stock_movements sm
     JOIN returns r ON r.id = sm.reference_id
     WHERE sm.movement_type = 'return'
       AND sm.reference_type = 'return'
       AND sm.product_id = ?
       AND r.sale_id = ?
       AND r.id != ?
       AND (sm._deleted = 0 OR sm._deleted IS NULL)
     GROUP BY sm.stock_batch_id`,
    [productId, saleId, excludeReturnId],
  );
  const byBatch = new Map<string, number>();
  for (const row of rows) {
    if (row.stock_batch_id) byBatch.set(row.stock_batch_id, row.restored || 0);
  }
  return byBatch;
}

async function restoreBatchQuantity(
  stockBatchId: string,
  quantity: number,
  { productId, costPrice, returnId, performedBy }: Omit<RestoreParams, "saleItemId" | "legacyStockBatchId" | "returnQuantity">,
) {
  const currentInv = await getStockBatchById(stockBatchId);
  if (currentInv) {
    await update("stock_batches", stockBatchId, {
      quantity: (currentInv.quantity || 0) + quantity,
    });
  }

  // unit_cost/total_cost record the stock's cost basis, matching how sale
  // and purchase-order movements populate these fields: using the sale's
  // selling price here (as this used to) mixed cost and revenue figures
  // under the same field, showing e.g. a refund's revenue value right next
  // to a sale's cost-of-goods value on the dashboard activity feed.
  await insert("stock_movements", {
    product_id: productId,
    stock_batch_id: stockBatchId,
    movement_type: "return",
    quantity: Math.abs(quantity),
    unit_cost: costPrice,
    total_cost: costPrice * quantity,
    reference_id: returnId,
    reference_type: "return",
    reason: "Customer return",
    performed_by: performedBy || null,
    movement_date: new Date().toISOString(),
  });
}

/**
 * Restores stock for a returned sale line to the exact batches it was drawn
 * from, in the proportions recorded at sale time (FEFO splits may span >1
 * batch). Falls back to the legacy single stock_batch_id for sales made
 * before sale_item_batches existed.
 */
export async function restoreReturnedStock(params: RestoreParams) {
  const { saleItemId, legacyStockBatchId, returnQuantity, productId, costPrice, returnId, saleId, performedBy } = params;
  const consumedBatches = await getSaleItemBatches(saleItemId);
  // A second (or third) partial return of the same sale line must not
  // restore batches from scratch — without this, every partial return
  // restarted allocation at the first batch in `consumedBatches`, so e.g. a
  // 10-unit line split 6/batch-A + 4/batch-B returned as 6 then 4 put all
  // 10 units back into batch A and left batch B permanently 4 short (wrong
  // expiry date on those 4 units, and a skewed per-batch cost valuation) —
  // product-level totals looked correct throughout, which is why this had
  // no visible symptom on any stock screen.
  const alreadyRestored = saleId
    ? await getAlreadyRestoredByBatch(productId, saleId, returnId)
    : new Map<string, number>();
  let remaining = returnQuantity;

  for (const consumed of consumedBatches) {
    if (remaining <= 0) break;
    const restoredSoFar = alreadyRestored.get(consumed.stock_batch_id) || 0;
    const stillRestorable = Math.max(0, consumed.quantity - restoredSoFar);
    const restoreQty = Math.min(stillRestorable, remaining);
    if (restoreQty <= 0) continue;

    await restoreBatchQuantity(consumed.stock_batch_id, restoreQty, { productId, costPrice, returnId, performedBy });
    remaining -= restoreQty;
  }

  if (remaining > 0) {
    if (legacyStockBatchId) {
      await restoreBatchQuantity(legacyStockBatchId, remaining, { productId, costPrice, returnId, performedBy });
    } else {
      // No specific batch to credit (no sale_item_batches rows and no
      // legacy stock_batch_id) — previously this logged a stock_movements
      // row with stock_batch_id: null and never touched stock_batches at
      // all, so on-hand stock (SUM(stock_batches.quantity)) was never
      // credited back even though the customer was refunded. Find a
      // reasonable target batch for this product (or create one) and
      // restore into it instead, the same way a stock audit's "found extra
      // stock" branch picks/creates a target batch (see
      // getOrCreateTargetBatchForProduct) — so the ledger and the actual
      // on-hand total agree.
      const targetBatch = await getOrCreateTargetBatchForProduct(productId, {
        unitCost: costPrice,
        batchNumberPrefix: "RETURN",
      });
      await restoreBatchQuantity(targetBatch.id, remaining, { productId, costPrice, returnId, performedBy });
    }
  }
}

import { insert, query } from "@/lib/db/local-database";
import { getSaleItemBatches } from "@/lib/db/queries/sales";
import { getOrCreateTargetBatchForProduct } from "@/lib/db/queries/inventory";
import { roundMoney } from "@/lib/utils/pos-calculations";

interface RestoreParams {
  saleItemId: string;
  productId: string;
  costPrice: number;
  legacyStockBatchId?: string | null;
  returnQuantity: number;
  returnId: string;
  // The parent sale, used to scope how much of this product's per-batch split a *prior* return already restored (see the comment in restoreRetur…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-returns-ts-L13
  saleId?: string;
  performedBy?: string | null;
}

// How much of each of this sale_item's original per-batch split has already been restored by an *earlier* return of the same product within th…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-returns-ts-L22
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
  // unit_cost/total_cost record the stock's cost basis, matching how sale and purchase-order movements populate these fields:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-returns-ts-L51
  await insert("stock_movements", {
    product_id: productId,
    stock_batch_id: stockBatchId,
    movement_type: "return",
    quantity: Math.abs(quantity),
    unit_cost: costPrice,
    total_cost: roundMoney(costPrice * quantity),
    reference_id: returnId,
    reference_type: "return",
    reason: "Customer return",
    performed_by: performedBy || null,
    movement_date: new Date().toISOString(),
  });
}

// Restores stock for a returned sale line to the exact batches it was drawn from, in the proportions recorded at sale time (FEFO splits may sp…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-returns-ts-L80
export async function restoreReturnedStock(params: RestoreParams) {
  const { saleItemId, legacyStockBatchId, returnQuantity, productId, costPrice, returnId, saleId, performedBy } = params;
  const consumedBatches = await getSaleItemBatches(saleItemId);
  // A second (or third) partial return of the same sale line must not restore batches from scratch — without this, every partial return restarte…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-returns-ts-L76
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
      // No specific batch to credit (no sale_item_batches rows and no legacy stock_batch_id) — previously this logged a stock_movements row with sto…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-returns-ts-L104
      const targetBatch = await getOrCreateTargetBatchForProduct(productId, {
        unitCost: costPrice,
        batchNumberPrefix: "RETURN",
      });
      await restoreBatchQuantity(targetBatch.id, remaining, { productId, costPrice, returnId, performedBy });
    }
  }
}

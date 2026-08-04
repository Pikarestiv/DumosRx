import { insert, update } from "@/lib/db/local-database";
import { getSaleItemBatches } from "@/lib/db/queries/sales";
import { getStockBatchById } from "@/lib/db/queries/inventory";

interface RestoreParams {
  saleItemId: string;
  productId: string;
  costPrice: number;
  legacyStockBatchId?: string | null;
  returnQuantity: number;
  returnId: string;
  performedBy?: string | null;
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
  // and purchase-order movements populate these fields — using the sale's
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
  const { saleItemId, legacyStockBatchId, returnQuantity, productId, costPrice, returnId, performedBy } = params;
  const consumedBatches = await getSaleItemBatches(saleItemId);
  let remaining = returnQuantity;

  for (const consumed of consumedBatches) {
    if (remaining <= 0) break;
    const restoreQty = Math.min(consumed.quantity, remaining);
    if (restoreQty <= 0) continue;

    await restoreBatchQuantity(consumed.stock_batch_id, restoreQty, { productId, costPrice, returnId, performedBy });
    remaining -= restoreQty;
  }

  if (remaining > 0) {
    if (legacyStockBatchId) {
      await restoreBatchQuantity(legacyStockBatchId, remaining, { productId, costPrice, returnId, performedBy });
    } else {
      await insert("stock_movements", {
        product_id: productId,
        stock_batch_id: null,
        movement_type: "return",
        quantity: Math.abs(remaining),
        unit_cost: costPrice,
        total_cost: costPrice * remaining,
        reference_id: returnId,
        reference_type: "return",
        reason: "Customer return",
        performed_by: performedBy || null,
        movement_date: new Date().toISOString(),
      });
    }
  }
}

import { insert, query } from "@/lib/db/local-database";
import { getSaleItemBatches } from "@/lib/db/queries/sales";
import { getOrCreateTargetBatchForProduct } from "@/lib/db/queries/inventory";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { ADJUSTMENT_REASON_NOTE_SEPARATOR } from "@/lib/constants/stock-adjustments";

export interface RestoreParams {
  saleItemId: string;
  productId: string;
  costPrice: number;
  legacyStockBatchId?: string | null;
  returnQuantity: number;
  returnId: string;
  saleId?: string;
  performedBy?: string | null;
}

export interface ReturnDispositionParams extends RestoreParams {
  discardQuantity?: number;
  discardReason?: string;
}

async function getAlreadyProcessedByBatch(
  productId: string,
  saleId: string,
  excludeReturnId: string,
): Promise<Map<string, number>> {
  const rows = await query<{ stock_batch_id: string | null; processed: number }>(
    `SELECT sm.stock_batch_id as stock_batch_id, SUM(ABS(sm.quantity)) as processed
     FROM stock_movements sm
     JOIN returns r ON r.id = sm.reference_id
     WHERE (sm.movement_type = 'return' OR (sm.movement_type = 'adjustment' AND sm.reason LIKE 'Damage%'))
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
    if (row.stock_batch_id) byBatch.set(row.stock_batch_id, row.processed || 0);
  }
  return byBatch;
}

async function restoreBatchQuantity(
  stockBatchId: string,
  quantity: number,
  { productId, costPrice, returnId, performedBy }: Omit<RestoreParams, "saleItemId" | "legacyStockBatchId" | "returnQuantity">,
) {
  let unitCost = costPrice;
  if (stockBatchId) {
    const rows = await query<{ cost_price: number | null }>(
      "SELECT cost_price FROM stock_batches WHERE id = ?",
      [stockBatchId],
    );
    if (rows[0]?.cost_price != null && rows[0].cost_price > 0) {
      unitCost = rows[0].cost_price;
    }
  }

  await insert("stock_movements", {
    product_id: productId,
    stock_batch_id: stockBatchId,
    movement_type: "return",
    quantity: Math.abs(quantity),
    unit_cost: unitCost,
    total_cost: roundMoney(unitCost * quantity),
    reference_id: returnId,
    reference_type: "return",
    reason: "Customer return",
    performed_by: performedBy || null,
    movement_date: new Date().toISOString(),
  });
}

export async function recordReturnDisposition(params: ReturnDispositionParams) {
  const {
    saleItemId,
    legacyStockBatchId,
    returnQuantity,
    discardQuantity = 0,
    discardReason,
    productId,
    costPrice,
    returnId,
    saleId,
    performedBy,
  } = params;

  if (returnQuantity <= 0) return;

  const discardQty = Math.max(0, Math.min(discardQuantity, returnQuantity));
  let remainingRestock = returnQuantity - discardQty;
  let remainingDiscard = discardQty;

  const consumedBatches = await getSaleItemBatches(saleItemId);
  const alreadyProcessed = saleId
    ? await getAlreadyProcessedByBatch(productId, saleId, returnId)
    : new Map<string, number>();

  for (const consumed of consumedBatches) {
    if (remainingRestock <= 0 && remainingDiscard <= 0) break;

    const processedSoFar = alreadyProcessed.get(consumed.stock_batch_id) || 0;
    let availableInBatch = Math.max(0, consumed.quantity - processedSoFar);
    if (availableInBatch <= 0) continue;

    const batchRows = await query<{ cost_price: number | null }>(
      "SELECT cost_price FROM stock_batches WHERE id = ?",
      [consumed.stock_batch_id],
    );
    const batchUnitCost = (batchRows[0]?.cost_price != null && batchRows[0].cost_price > 0)
      ? batchRows[0].cost_price
      : costPrice;

    if (remainingRestock > 0 && availableInBatch > 0) {
      const takeRestock = Math.min(availableInBatch, remainingRestock);
      await restoreBatchQuantity(consumed.stock_batch_id, takeRestock, {
        productId,
        costPrice: batchUnitCost,
        returnId,
        performedBy,
      });
      remainingRestock -= takeRestock;
      availableInBatch -= takeRestock;
    }

    if (remainingDiscard > 0 && availableInBatch > 0) {
      const takeDiscard = Math.min(availableInBatch, remainingDiscard);
      const discardNote = discardReason ? `: ${discardReason}` : "";
      await insert("stock_movements", {
        product_id: productId,
        stock_batch_id: null,
        movement_type: "adjustment",
        quantity: -takeDiscard,
        unit_cost: batchUnitCost,
        total_cost: roundMoney(batchUnitCost * takeDiscard),
        reference_id: returnId,
        reference_type: "return",
        reason: `Damage${ADJUSTMENT_REASON_NOTE_SEPARATOR}Customer return discarded${discardNote}`,
        performed_by: performedBy || null,
        movement_date: new Date().toISOString(),
      });
      remainingDiscard -= takeDiscard;
      availableInBatch -= takeDiscard;
    }
  }

  if (remainingRestock > 0) {
    if (legacyStockBatchId) {
      await restoreBatchQuantity(legacyStockBatchId, remainingRestock, {
        productId,
        costPrice,
        returnId,
        performedBy,
      });
    } else {
      const targetBatch = await getOrCreateTargetBatchForProduct(productId, {
        unitCost: costPrice,
        batchNumberPrefix: "RETURN",
      });
      await restoreBatchQuantity(targetBatch.id, remainingRestock, {
        productId,
        costPrice,
        returnId,
        performedBy,
      });
    }
  }

  if (remainingDiscard > 0) {
    const discardNote = discardReason ? `: ${discardReason}` : "";
    await insert("stock_movements", {
      product_id: productId,
      stock_batch_id: null,
      movement_type: "adjustment",
      quantity: -remainingDiscard,
      unit_cost: costPrice,
      total_cost: roundMoney(costPrice * remainingDiscard),
      reference_id: returnId,
      reference_type: "return",
      reason: `Damage${ADJUSTMENT_REASON_NOTE_SEPARATOR}Customer return discarded${discardNote}`,
      performed_by: performedBy || null,
      movement_date: new Date().toISOString(),
    });
  }
}

export async function restoreReturnedStock(params: RestoreParams) {
  return recordReturnDisposition({ ...params, discardQuantity: 0 });
}

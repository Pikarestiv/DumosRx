import { insert, transaction, isInTransaction } from "@/lib/db/local-database";
import type { StockBatch } from "@/lib/types/stock-batch";
import { roundMoney } from "@/lib/utils/pos-calculations";
import {
  getBatchesForProduct,
  getAnyActiveBatchForProduct,
  getOrCreateTargetBatchForProduct,
} from "./inventory-batches";

interface RecordSaleItemStockParams {
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  /** Catalog price when the line was rung up; null when unknown. */
  listPrice?: number | null;
  costPrice: number;
  subtotal: number;
  cashierId: string | null;
  /** Ties this line item's audit_logs rows to the rest of the sale's, so
   * the Activity Log can collapse them into one entry. */
  correlationId?: string;
}

// Inserts the sale_items row for one cart line and deducts/logs the stock it consumed.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-ts-L152
export async function recordSaleItemStock(params: RecordSaleItemStockParams) {
  // The quantity write and its `stock_movements` row must land together or a concurrent stock fold writes the pre-sale number back.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-ts-L160
  if (isInTransaction()) return writeSaleItemStock(params);
  return transaction(() => writeSaleItemStock(params));
}

async function writeSaleItemStock({
  saleId,
  productId,
  quantity,
  unitPrice,
  listPrice,
  costPrice,
  subtotal,
  cashierId,
  correlationId,
}: RecordSaleItemStockParams) {
  // Prefer FEFO picking among batches that still show positive stock; if the product's true stock is already fully depleted, fall back to whatev…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L171
  let batches = await getBatchesForProduct(productId);
  if (batches.length === 0) {
    batches = await getAnyActiveBatchForProduct(productId);
  }
  // Last resort, in order:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L179
  if (batches.length === 0) {
    batches = await getAnyActiveBatchForProduct(productId, { includeExpired: true });
  }
  if (batches.length === 0) {
    batches = [
      await getOrCreateTargetBatchForProduct(productId, {
        unitCost: costPrice || 0,
        batchNumberPrefix: "SALE",
      }),
    ];
  }

  const saleItemId = await insert("sale_items", {
    sale_id: saleId,
    product_id: productId,
    // Primary/first batch consumed; retained for backward-compat display only.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L198
    stock_batch_id: batches[0]?.id || null,
    quantity,
    unit_price: unitPrice,
    list_price: listPrice ?? null,
    cost_price: costPrice || 0,
    total_price: subtotal,
  }, { correlationId });

  let remainingToDeduct = quantity;

  // Accumulates the total quantity deducted per unique batch id across BOTH the main positive-stock loop below and the partial-shortfall fallbac…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L210
  const deductionByBatchId = new Map<string, number>();

  // Batches touched by a deduction that exceeded what they actually had available (deduction > batch.quantity at the time it was applied) — i.e.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L223
  const oversoldBatchIds = new Set<string>();

  // What each touched batch has left as this call proceeds.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L231
  const liveQuantity = new Map<string, number>();

  // batch.quantity can be <= 0 when this batch only turned up via the getAnyActiveBatchForProduct fallback (nothing with positive stock left for…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L238
  const deductFromBatch = (batch: StockBatch) => {
    const available = liveQuantity.get(batch.id) ?? batch.quantity;
    const deduction =
      available > 0 ? Math.min(available, remainingToDeduct) : remainingToDeduct;

    if (deduction > available) {
      oversoldBatchIds.add(batch.id);
    }

    liveQuantity.set(batch.id, Math.max(0, available - deduction));

    deductionByBatchId.set(
      batch.id,
      (deductionByBatchId.get(batch.id) ?? 0) + deduction,
    );

    remainingToDeduct -= deduction;
  };

  for (const batch of batches) {
    if (remainingToDeduct <= 0) break;
    await deductFromBatch(batch);
  }

  // Partial shortfall: the positive-stock batches above didn't cover the whole quantity — e.g.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L273
  if (remainingToDeduct > 0) {
    let fallbackBatches = await getAnyActiveBatchForProduct(productId);
    if (fallbackBatches.length === 0) {
      fallbackBatches = await getAnyActiveBatchForProduct(productId, { includeExpired: true });
    }
    for (const batch of fallbackBatches) {
      if (remainingToDeduct <= 0) break;
      await deductFromBatch(batch);
    }
  }

  for (const [batchId, deduction] of deductionByBatchId) {
    await insert("sale_item_batches", {
      sale_item_id: saleItemId,
      stock_batch_id: batchId,
      quantity: deduction,
    }, { correlationId });

    await insert("stock_movements", {
      product_id: productId,
      stock_batch_id: batchId,
      movement_type: "sale",
      quantity: -Math.abs(deduction),
      unit_cost: costPrice || 0,
      total_cost: roundMoney((costPrice || 0) * deduction),
      reference_id: saleId,
      reference_type: "sale",
      reason: oversoldBatchIds.has(batchId)
        ? "Customer sale (oversold — insufficient batch stock)"
        : "Customer sale",
      performed_by: cashierId,
      movement_date: new Date().toISOString(),
    }, { correlationId });
  }

  return saleItemId;
}

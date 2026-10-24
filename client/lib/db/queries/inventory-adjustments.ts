import { insert, update, transaction } from "@/lib/db/local-database";
import {
  ADJUSTMENT_REFERENCE_TYPE,
  AUDIT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";
import { roundMoney } from "@/lib/utils/pos-calculations";
import {
  getBatchesForProduct,
  getAnyActiveBatchForProduct,
  getOrCreateTargetBatchForProduct,
  getProductStockQuantity,
} from "./inventory-batches";

export async function createStockMovement(movement: {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason?: string;
  stock_batch_id?: string;
}) {
  return insert("stock_movements", movement);
}

export interface StockAuditSubmission {
  productId: string;
  systemQty: number;
  /** Omitted for a price-only correction, and resolved below against the
   * quantity this function re-reads - never treated as zero. */
  countedQty?: number;
  // What the system believed this product held at the moment `countedQty` was observed.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-ts-L578
  baselineQty?: number;
  systemCostPrice?: number;
  countedCostPrice?: number;
  systemSellingPrice?: number;
  countedSellingPrice?: number;
  reason?: string;
}

// Persists a completed cycle count:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L641
export async function submitStockAudit(
  items: StockAuditSubmission[],
  performedBy: string | null,
  referenceType: string = AUDIT_REFERENCE_TYPE,
) {
  // stock_audits.user_id is a constrained foreign key server-side.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L582
  if (!performedBy) {
    throw new Error("Cannot record a stock audit without a performing user");
  }

  return transaction(async () => {
    for (const item of items) {
      // Re-read the product's ACTUAL current system quantity inside the transaction rather than trusting item.systemQty as-is:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L594
      const currentSystemQty = await getProductStockQuantity(item.productId);

      const hasCount = Number.isFinite(item.countedQty as number);
      const countedQty = hasCount
        ? (item.countedQty as number)
        : currentSystemQty;
      // The baseline only applies to a row that was actually counted:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L609
      const baselineQty =
        hasCount && item.baselineQty !== undefined
          ? item.baselineQty
          : currentSystemQty;
      const diff = countedQty - baselineQty;
      const costDiff =
        item.countedCostPrice !== undefined && item.systemCostPrice !== undefined
          ? item.countedCostPrice - item.systemCostPrice
          : 0;
      const sellingDiff =
        item.countedSellingPrice !== undefined && item.systemSellingPrice !== undefined
          ? item.countedSellingPrice - item.systemSellingPrice
          : 0;

      if (diff === 0 && costDiff === 0 && sellingDiff === 0) continue;

      const auditId = crypto.randomUUID();
      await insert("stock_audits", {
        id: auditId,
        product_id: item.productId,
        expected_quantity: baselineQty,
        actual_quantity: countedQty,
        difference: diff,
        expected_cost_price: item.systemCostPrice ?? null,
        actual_cost_price: item.countedCostPrice ?? null,
        cost_price_difference: costDiff || null,
        expected_selling_price: item.systemSellingPrice ?? null,
        actual_selling_price: item.countedSellingPrice ?? null,
        selling_price_difference: sellingDiff || null,
        notes: item.reason || null,
        user_id: performedBy,
        status: "reconciled",
        reconciled_at: new Date().toISOString(),
      });

      if (costDiff !== 0 && item.countedCostPrice !== undefined) {
        // A cost-price audit correction is a master-data fix, not a new purchase at a new cost; apply it to every active batch of this product rather…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L648
        const activeBatches = await getBatchesForProduct(item.productId);
        for (const batch of activeBatches) {
          await update("stock_batches", batch.id, {
            cost_price: item.countedCostPrice,
          });
        }
      }

      if (sellingDiff !== 0 && item.countedSellingPrice !== undefined) {
        await update("products", item.productId, {
          selling_price: item.countedSellingPrice,
        });
      }

      if (diff === 0) continue;

      // Without unit_cost/total_cost, a cycle-count adjustment's real value impact was invisible to getStockMoM()'s 30-day added/removed-value sums…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L667
      const unitCost = item.countedCostPrice ?? item.systemCostPrice ?? 0;

      await applyStockAdjustmentDelta({
        productId: item.productId,
        delta: diff,
        unitCost,
        reason: item.reason || "Cycle count adjustment",
        shortfallReason:
          item.reason ||
          "Cycle count adjustment (shortfall exceeded tracked batch quantity)",
        referenceId: auditId,
        referenceType,
        batchNumberPrefix: "AUDIT",
        performedBy,
      });
    }
  });
}

interface StockAdjustmentDelta {
  productId: string;
  delta: number;
  unitCost: number;
  reason: string;
  shortfallReason?: string;
  referenceId: string;
  referenceType: string;
  batchNumberPrefix: string;
  performedBy: string | null;
}

// The one implementation of "move a product's on-hand stock by `delta`, spread across its batches, leaving a stock_movements trail".
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-ts-L719
async function applyStockAdjustmentDelta({
  productId,
  delta,
  unitCost,
  reason,
  shortfallReason,
  referenceId,
  referenceType,
  batchNumberPrefix,
  performedBy,
}: StockAdjustmentDelta) {
  if (delta === 0) return;

  let remaining = Math.abs(delta);
  const batches = await getBatchesForProduct(productId);

  if (delta > 0) {
    // Found more stock than recorded:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L721
    const targetBatch = await getOrCreateTargetBatchForProduct(productId, {
      unitCost,
      batchNumberPrefix,
    });
    await insert("stock_movements", {
      product_id: productId,
      stock_batch_id: targetBatch.id,
      movement_type: "adjustment",
      quantity: remaining,
      unit_cost: unitCost,
      total_cost: roundMoney(unitCost * remaining),
      reason,
      reference_id: referenceId,
      reference_type: referenceType,
      performed_by: performedBy || null,
      movement_date: new Date().toISOString(),
    });
    return;
  }

  // Found less stock than recorded: deduct FEFO across batches until
  // the shortfall is accounted for or stock runs out.
  for (const batch of batches) {
    if (remaining <= 0) break;
    const deductQty = Math.min(batch.quantity, remaining);
    if (deductQty <= 0) continue;

    await insert("stock_movements", {
      product_id: productId,
      stock_batch_id: batch.id,
      movement_type: "adjustment",
      quantity: -deductQty,
      unit_cost: unitCost,
      total_cost: roundMoney(unitCost * deductQty),
      reason,
      reference_id: referenceId,
      reference_type: referenceType,
      performed_by: performedBy || null,
      movement_date: new Date().toISOString(),
    });
    remaining -= deductQty;
  }

  // The removal was larger than every active batch's summed quantity could cover (system quantity was already spread thinner across batches than…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L776
  if (remaining > 0) {
    // includeExpired: true - unlike the sale-dispensing fallback (which correctly excludes expired stock), a correction needs to be able to write…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L786
    const [fallbackBatch] = await getAnyActiveBatchForProduct(productId, {
      includeExpired: true,
    });
    if (fallbackBatch) {
      await insert("stock_movements", {
        product_id: productId,
        stock_batch_id: fallbackBatch.id,
        movement_type: "adjustment",
        quantity: -remaining,
        unit_cost: unitCost,
        total_cost: roundMoney(unitCost * remaining),
        reason: shortfallReason ?? reason,
        reference_id: referenceId,
        reference_type: referenceType,
        performed_by: performedBy || null,
        movement_date: new Date().toISOString(),
      });
    }
  }
}

export interface StockAdjustmentSubmission {
  productId: string;
  delta: number;
  unitCost?: number;
}

// Persists a quick Adjust Stock submission:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-ts-L839
export async function submitStockAdjustment(
  items: StockAdjustmentSubmission[],
  { reason, performedBy }: { reason: string; performedBy: string | null },
): Promise<string> {
  // Same rule as submitStockAudit: performed_by is a constrained foreign key
  // server-side, and every caller is a route-guarded screen with a real user.
  if (!performedBy) {
    throw new Error("Cannot record a stock adjustment without a performing user");
  }

  const adjustmentId = crypto.randomUUID();

  await transaction(async () => {
    for (const item of items) {
      if (!item.delta) continue;
      await applyStockAdjustmentDelta({
        productId: item.productId,
        delta: item.delta,
        unitCost: item.unitCost ?? 0,
        reason,
        referenceId: adjustmentId,
        referenceType: ADJUSTMENT_REFERENCE_TYPE,
        batchNumberPrefix: "ADJ",
        performedBy,
      });
    }
  });

  return adjustmentId;
}

import {
  query,
  insert,
  update,
  transaction,
  generateId,
} from "@/lib/db/local-database";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { checkIsAdmin } from "@/lib/context/auth-context";
import {
  getSourceProduct,
  findDestProductId,
  createDestProduct,
} from "./stock-transfer-dest-product";

export {
  getTransferableProducts,
  getStockTransferHistory,
  type TransferableProductRow,
  type StockTransferHistoryRow,
} from "./stock-transfer-history";

// Data-model decision (see docs/superpowers or PR description for the fuller writeup):
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-L11
export const STOCK_TRANSFER_REFERENCE_TYPE = "stock_transfer";
export const STOCK_TRANSFER_NEEDS_REVIEW_STATUS = "needs_review";
export const STOCK_TRANSFER_REVIEWED_STATUS = "reviewed";

export interface StockTransferParams {
  sourceStoreId: string;
  destStoreId: string;
  /** Product id as it exists in the SOURCE store (products aren't shared
   * across stores — see findOrCreateDestProduct below). */
  productId: string;
  quantity: number;
  performedBy: string | null;
  reason?: string;
  // The initiating user's role.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-ts-L26
  initiatedByRole?: string;
}

export interface StockTransferResult {
  transferId: string;
  sourceProductId: string;
  destProductId: string;
  quantityTransferred: number;
  /** Weighted-average cost price across every source batch the transfer
   * drew from. */
  averageCostPrice: number;
}

interface SourceBatchRow {
  id: string;
  quantity: number;
  cost_price: number | null;
  expiry_date: string | null;
  created_at: string | null;
}

// Available (positive-quantity, active, non-deleted, non-expired) batches for a product, FEFO-ordered — the exact same "soonest-expiring first…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-L106
async function getAvailableSourceBatches(
  productId: string,
  storeId: string,
): Promise<SourceBatchRow[]> {
  return query<SourceBatchRow>(
    `SELECT id, quantity, cost_price, expiry_date, created_at FROM stock_batches
     WHERE product_id = ? AND store_id = ? AND _deleted = 0 AND is_active = 1 AND quantity > 0
       AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now'))
     ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, created_at ASC`,
    [productId, storeId],
  );
}

// Moves `quantity` units of one product from `sourceStoreId` to `destStoreId`, deducting FEFO from the source's batches, auto-creating (or reu…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-L259
export async function transferStock(
  params: StockTransferParams,
): Promise<StockTransferResult> {
  const {
    sourceStoreId,
    destStoreId,
    productId,
    quantity,
    performedBy,
    reason,
    initiatedByRole,
  } = params;

  const needsReview = !checkIsAdmin(initiatedByRole);

  if (!sourceStoreId || !destStoreId) {
    throw new Error("Both a source and destination store are required");
  }
  if (sourceStoreId === destStoreId) {
    throw new Error("Source and destination stores must be different");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Transfer quantity must be greater than zero");
  }

  const [sourceStoreRows, destStoreRows] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM stores WHERE id = ? AND (_deleted = 0 OR _deleted IS NULL)`,
      [sourceStoreId],
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM stores WHERE id = ? AND (_deleted = 0 OR _deleted IS NULL)`,
      [destStoreId],
    ),
  ]);
  const sourceStore = sourceStoreRows[0];
  const destStore = destStoreRows[0];
  if (!sourceStore) throw new Error("Source store not found");
  if (!destStore) throw new Error("Destination store not found");

  return await transaction(async () => {
    const sourceProduct = await getSourceProduct(productId, sourceStoreId);
    if (!sourceProduct) {
      throw new Error("Product not found in the source store");
    }

    const batches = await getAvailableSourceBatches(productId, sourceStoreId);
    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < quantity) {
      throw new Error(
        `Insufficient stock: only ${totalAvailable} unit(s) available, requested ${quantity}`,
      );
    }

    const transferId = generateId();
    const now = new Date().toISOString();

    let remaining = quantity;
    let totalCost = 0;
    let earliestExpiry: string | null = null;
    const drawn: { batchId: string; qty: number; cost: number }[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const draw = Math.min(batch.quantity, remaining);
      const cost = batch.cost_price ?? 0;
      drawn.push({ batchId: batch.id, qty: draw, cost });
      totalCost += draw * cost;
      remaining -= draw;
      if (
        batch.expiry_date &&
        (!earliestExpiry || batch.expiry_date < earliestExpiry)
      ) {
        earliestExpiry = batch.expiry_date;
      }

      // No quantity write here:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-stock-transfers-ts-L284
    }

    const averageCost = roundMoney(totalCost / quantity);

    let destProductId = await findDestProductId(sourceProduct, destStoreId);
    if (!destProductId) {
      destProductId = await createDestProduct(sourceProduct, destStoreId);
    }

    // Always opens a fresh batch on the destination rather than merging into an existing one:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-stock-transfers-ts-L296
    const destBatchId = await insert(
      "stock_batches",
      {
        product_id: destProductId,
        batch_number: `TRANSFER-${transferId.slice(0, 8).toUpperCase()}`,
        expiry_date: earliestExpiry,
        quantity: 0,
        cost_price: averageCost,
        is_active: 1,
        store_id: destStoreId,
      },
      { storeId: destStoreId },
    );

    for (const d of drawn) {
      await insert(
        "stock_movements",
        {
          product_id: productId,
          stock_batch_id: d.batchId,
          movement_type: "transfer_out",
          quantity: -Math.abs(d.qty),
          unit_cost: d.cost,
          total_cost: roundMoney(d.cost * d.qty),
          reference_id: transferId,
          reference_type: STOCK_TRANSFER_REFERENCE_TYPE,
          reason: reason || `Transfer to ${destStore.name}`,
          performed_by: performedBy,
          movement_date: now,
          store_id: sourceStoreId,
          status: needsReview ? STOCK_TRANSFER_NEEDS_REVIEW_STATUS : null,
        },
        { storeId: sourceStoreId },
      );
    }

    await insert(
      "stock_movements",
      {
        product_id: destProductId,
        stock_batch_id: destBatchId,
        movement_type: "transfer_in",
        quantity,
        unit_cost: averageCost,
        total_cost: roundMoney(averageCost * quantity),
        reference_id: transferId,
        reference_type: STOCK_TRANSFER_REFERENCE_TYPE,
        reason: reason || `Transfer from ${sourceStore.name}`,
        performed_by: performedBy,
        movement_date: now,
        store_id: destStoreId,
        status: needsReview ? STOCK_TRANSFER_NEEDS_REVIEW_STATUS : null,
      },
      { storeId: destStoreId },
    );

    return {
      transferId,
      sourceProductId: productId,
      destProductId,
      quantityTransferred: quantity,
      averageCostPrice: averageCost,
    };
  });
}

interface FlaggedTransferLegRow {
  id: string;
  store_id: string | null;
}

// Clears the `needs_review` flag on every leg of one transfer, marking it `reviewed` rather than blanking it so the record still shows the tra…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-ts-L381
export async function markStockTransferReviewed(
  transferId: string,
): Promise<number> {
  if (!transferId) {
    throw new Error("A transfer reference is required to mark it reviewed");
  }

  const legs = await query<FlaggedTransferLegRow>(
    `SELECT id, store_id FROM stock_movements
     WHERE reference_id = ? AND reference_type = ? AND status = ?
       AND (_deleted = 0 OR _deleted IS NULL)`,
    [
      transferId,
      STOCK_TRANSFER_REFERENCE_TYPE,
      STOCK_TRANSFER_NEEDS_REVIEW_STATUS,
    ],
  );

  for (const leg of legs) {
    await update(
      "stock_movements",
      leg.id,
      { status: STOCK_TRANSFER_REVIEWED_STATUS },
      { storeId: leg.store_id ?? undefined },
    );
  }

  return legs.length;
}

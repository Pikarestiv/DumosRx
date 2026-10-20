import {
  query,
  insert,
  update,
  transaction,
  generateId,
} from "@/lib/db/local-database";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { checkIsAdmin } from "@/lib/context/auth-context";

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

interface SourceProductRow {
  id: string;
  name: string;
  generic_name: string | null;
  category_id: string | null;
  manufacturer: string | null;
  nafdac_number: string | null;
  dosage_form: string | null;
  strength: string | null;
  pack_size: string | null;
  unit_of_measure: string | null;
  description: string | null;
  indications: string | null;
  contraindications: string | null;
  side_effects: string | null;
  storage_conditions: string | null;
  selling_price: number | null;
  requires_prescription: number | null;
  is_controlled: number | null;
  barcode: string | null;
  base_unit: string | null;
  bulk_unit: string | null;
  units_per_bulk: number | null;
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

async function getSourceProduct(
  productId: string,
  sourceStoreId: string,
): Promise<SourceProductRow | null> {
  const rows = await query<SourceProductRow>(
    `SELECT * FROM products WHERE id = ? AND _deleted = 0 AND store_id = ? LIMIT 1`,
    [productId, sourceStoreId],
  );
  return rows[0] ?? null;
}

// Mirrors findExistingProductId's precedence in product-import.ts (barcode -> name+category -> name), just scoped to an explicit destStoreId i…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-ts-L103
async function findDestProductId(
  product: SourceProductRow,
  destStoreId: string,
): Promise<string | null> {
  if (product.barcode) {
    const byBarcode = await query<{ id: string }>(
      `SELECT id FROM products WHERE barcode = ? AND _deleted = 0 AND store_id = ? LIMIT 1`,
      [product.barcode, destStoreId],
    );
    if (byBarcode.length > 0) return byBarcode[0].id;
  }

  let categoryName: string | null = null;
  if (product.category_id) {
    const cat = await query<{ name: string }>(
      `SELECT name FROM categories WHERE id = ?`,
      [product.category_id],
    );
    categoryName = cat[0]?.name ?? null;
  }

  if (categoryName) {
    const byNameAndCategory = await query<{ id: string }>(
      `SELECT p.id FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.name = ? COLLATE NOCASE AND c.name = ? COLLATE NOCASE AND p._deleted = 0 AND p.store_id = ?
       LIMIT 1`,
      [product.name, categoryName, destStoreId],
    );
    if (byNameAndCategory.length > 0) return byNameAndCategory[0].id;
  }

  const byNameOnly = await query<{ id: string }>(
    `SELECT id FROM products WHERE name = ? COLLATE NOCASE AND _deleted = 0 AND store_id = ? LIMIT 1`,
    [product.name, destStoreId],
  );
  return byNameOnly[0]?.id ?? null;
}

async function resolveDestCategoryId(
  categoryId: string | null,
  destStoreId: string,
): Promise<string | null> {
  if (!categoryId) return null;
  const source = await query<{ name: string }>(
    `SELECT name FROM categories WHERE id = ?`,
    [categoryId],
  );
  const name = source[0]?.name;
  if (!name) return null;

  const existing = await query<{ id: string }>(
    `SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND _deleted = 0 AND (store_id = ? OR store_id IS NULL) LIMIT 1`,
    [name, destStoreId],
  );
  if (existing.length > 0) return existing[0].id;

  return await insert(
    "categories",
    { name, store_id: destStoreId },
    { storeId: destStoreId },
  );
}

// Creates the destination-store product row the first time a product is transferred to a store that's never carried it before.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-L210
async function createDestProduct(
  product: SourceProductRow,
  destStoreId: string,
): Promise<string> {
  const destCategoryId = await resolveDestCategoryId(
    product.category_id,
    destStoreId,
  );

  return await insert(
    "products",
    {
      name: product.name,
      generic_name: product.generic_name ?? null,
      category_id: destCategoryId,
      manufacturer: product.manufacturer ?? null,
      nafdac_number: product.nafdac_number ?? null,
      dosage_form: product.dosage_form ?? null,
      strength: product.strength ?? null,
      pack_size: product.pack_size ?? null,
      unit_of_measure: product.unit_of_measure ?? null,
      description: product.description ?? null,
      indications: product.indications ?? null,
      contraindications: product.contraindications ?? null,
      side_effects: product.side_effects ?? null,
      storage_conditions: product.storage_conditions ?? null,
      selling_price: product.selling_price ?? 0,
      requires_prescription: product.requires_prescription ?? 0,
      is_controlled: product.is_controlled ?? 0,
      barcode: product.barcode ?? null,
      base_unit: product.base_unit ?? "Unit",
      bulk_unit: product.bulk_unit ?? null,
      units_per_bulk: product.units_per_bulk ?? 1,
      store_id: destStoreId,
    },
    { storeId: destStoreId },
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

export interface TransferableProductRow {
  id: string;
  name: string;
  barcode: string | null;
  base_unit: string | null;
  available_quantity: number;
}

// Products with positive stock in `storeId`, for the transfer dialog's product picker — deliberately takes an explicit store id rather than re…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-ts-L428
export async function getTransferableProducts(
  storeId: string,
): Promise<TransferableProductRow[]> {
  return query<TransferableProductRow>(
    `SELECT p.id, p.name, p.barcode, p.base_unit,
            COALESCE(SUM(sb.quantity), 0) as available_quantity
     FROM products p
     JOIN stock_batches sb ON sb.product_id = p.id AND sb.store_id = p.store_id
       AND sb._deleted = 0 AND sb.is_active = 1
       AND (sb.expiry_date IS NULL OR sb.expiry_date = '' OR date(sb.expiry_date) > date('now'))
     WHERE p._deleted = 0 AND p.store_id = ?
     GROUP BY p.id
     HAVING available_quantity > 0
     ORDER BY p.name ASC`,
    [storeId],
  );
}

export interface StockTransferHistoryRow {
  id: string;
  movement_date: string | null;
  quantity: number;
  source_store_id: string | null;
  source_store_name: string | null;
  dest_store_id: string | null;
  dest_store_name: string | null;
  source_product_name: string | null;
  dest_product_name: string | null;
  unit_cost: number | null;
  performed_by: string | null;
  performed_by_name: string | null;
  reason: string | null;
}

// Reconstructs one row per transfer by grouping the transfer_out side of stock_movements on reference_id and joining in its paired transfer_in…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-ts-L466
export async function getStockTransferHistory(
  limit = 100,
): Promise<StockTransferHistoryRow[]> {
  return query<StockTransferHistoryRow>(
    `SELECT
       o.reference_id as id,
       MIN(o.movement_date) as movement_date,
       SUM(-o.quantity) as quantity,
       o.store_id as source_store_id,
       so.name as source_store_name,
       i.store_id as dest_store_id,
       ds.name as dest_store_name,
       po.name as source_product_name,
       pi.name as dest_product_name,
       i.unit_cost as unit_cost,
       o.performed_by as performed_by,
       TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) as performed_by_name,
       o.reason as reason
     FROM stock_movements o
     JOIN (
       SELECT reference_id, store_id, unit_cost, product_id
       FROM stock_movements
       WHERE movement_type = 'transfer_in' AND reference_type = ?
     ) i ON i.reference_id = o.reference_id
     LEFT JOIN stores so ON so.id = o.store_id
     LEFT JOIN stores ds ON ds.id = i.store_id
     -- Products joined unfiltered on purpose: a deleted product must still name its
     -- transfer history (client/AGENTS.md; deleted-entity-procurement-history.test.ts).
     LEFT JOIN products po ON po.id = o.product_id
     LEFT JOIN products pi ON pi.id = i.product_id
     LEFT JOIN users u ON u.id = o.performed_by
     WHERE o.movement_type = 'transfer_out' AND o.reference_type = ? AND (o._deleted = 0 OR o._deleted IS NULL)
     GROUP BY o.reference_id
     ORDER BY movement_date DESC
     LIMIT ?`,
    [STOCK_TRANSFER_REFERENCE_TYPE, STOCK_TRANSFER_REFERENCE_TYPE, limit],
  );
}

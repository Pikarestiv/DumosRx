import { query, insert, update, transaction, generateId } from "@/lib/db/local-database";
import { getActiveStoreId, setActiveStoreId } from "@/lib/db/core";

/**
 * Data-model decision (see docs/superpowers or PR description for the
 * fuller writeup): transfers are NOT given a dedicated `stock_transfers`
 * header table. They're represented purely as a paired `movement_type:
 * 'transfer_out'` / `'transfer_in'` row in the already-synced
 * `stock_movements` table, sharing a generated id as `reference_id` with
 * `reference_type: 'stock_transfer'` — exactly the pattern the rest of the
 * app already uses to cross-reference a sale or a stock audit. A header
 * table was considered (and is explicitly the "recommended" shape per the
 * feature spec) but rejected for now: this repo's sync engine has no
 * generic per-table plumbing gap, but a brand-new table still needs a
 * matching Laravel migration on the server side (laravel-server/) before it
 * can round-trip through cloud sync, and this change is client-only. Adding
 * an un-synced local table on a live production account (see task
 * instructions) would mean transfer history silently fails to appear on any
 * other device/terminal until that server work lands — worse than not
 * having a header table at all. `getStockTransferHistory()` below
 * reconstructs the same "one row per transfer" view by grouping
 * stock_movements on reference_id, so the UI doesn't need one. If/when the
 * "cashier requests, admin approves" workflow (explicitly out of scope
 * here) gets built, that's the natural point to revisit this and add a
 * real `status`-bearing header table with the server migration to match.
 */
export const STOCK_TRANSFER_REFERENCE_TYPE = "stock_transfer";

export interface StockTransferParams {
  sourceStoreId: string;
  destStoreId: string;
  /** Product id as it exists in the SOURCE store (products aren't shared
   * across stores — see findOrCreateDestProduct below). */
  productId: string;
  quantity: number;
  performedBy: string | null;
  reason?: string;
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

/**
 * Available (positive-quantity, active, non-deleted) batches for a product,
 * FEFO-ordered — the exact same "soonest-expiring first" convention
 * recordSaleItemStock() (lib/db/queries/inventory.ts) already uses for
 * deducting stock on a sale, reused here rather than inventing a second
 * deduction order for transfers.
 */
async function getAvailableSourceBatches(productId: string): Promise<SourceBatchRow[]> {
  return query<SourceBatchRow>(
    `SELECT id, quantity, cost_price, expiry_date, created_at FROM stock_batches
     WHERE product_id = ? AND _deleted = 0 AND is_active = 1 AND quantity > 0
     ORDER BY expiry_date ASC, created_at ASC`,
    [productId],
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

/**
 * Mirrors findExistingProductId's precedence in product-import.ts (barcode
 * -> name+category -> name), just scoped to an explicit destStoreId instead
 * of the active-store resolver, since a transfer's destination store is
 * very often NOT the store currently active in the UI.
 */
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
  const source = await query<{ name: string }>(`SELECT name FROM categories WHERE id = ?`, [
    categoryId,
  ]);
  const name = source[0]?.name;
  if (!name) return null;

  const existing = await query<{ id: string }>(
    `SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND _deleted = 0 AND (store_id = ? OR store_id IS NULL) LIMIT 1`,
    [name, destStoreId],
  );
  if (existing.length > 0) return existing[0].id;

  return await insert("categories", { name, store_id: destStoreId });
}

/**
 * Creates the destination-store product row the first time a product is
 * transferred to a store that's never carried it before. Copies static,
 * product-identity fields (name, category, manufacturer/dosage metadata,
 * barcode, unit config, an initial selling price) so the new row is usable
 * immediately; deliberately does NOT copy `reorder_level` (a per-branch
 * reorder threshold — two branches can have very different turnover for the
 * same product, so it should start at this table's own default, not
 * whatever the source branch happened to have it set to).
 */
async function createDestProduct(
  product: SourceProductRow,
  destStoreId: string,
): Promise<string> {
  const destCategoryId = await resolveDestCategoryId(product.category_id, destStoreId);

  return await insert("products", {
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
  });
}

/**
 * Moves `quantity` units of one product from `sourceStoreId` to
 * `destStoreId`, deducting FEFO from the source's batches, auto-creating (or
 * reusing) the matching product on the destination store, opening a single
 * new destination batch carrying the weighted-average cost of everything
 * drawn from, and writing the paired transfer_out/transfer_in
 * stock_movements rows. Fully atomic: any failure (store not found,
 * insufficient stock) throws before any write and the whole transaction
 * rolls back.
 */
export async function transferStock(params: StockTransferParams): Promise<StockTransferResult> {
  const { sourceStoreId, destStoreId, productId, quantity, performedBy, reason } = params;

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

  // The module-level active-store resolver (lib/db/core.ts) is what
  // insert()/update()'s per-row store-ownership guard (assertStoreOwnership
  // in base-helpers.ts) checks against, and it rejects an update() whose
  // row's store_id doesn't match it. A transfer, by definition, writes rows
  // owned by two different stores in one transaction, and the owner
  // performing it may currently have EITHER store (or neither) active in
  // the UI. Clearing the resolver for the duration of this transaction
  // relies on that guard's own documented fail-open behavior when no active
  // store is set; every insert()/update() call below still pins its own
  // store_id explicitly, so this doesn't loosen scoping anywhere else, only
  // stops the resolver from vetoing this one legitimate cross-store write.
  // Known trade-off: an unrelated read elsewhere in the app that calls
  // getActiveStoreId() while this transaction is mid-flight would briefly
  // see "no store" (unscoped) instead of its real active store. This
  // mirrors a narrow race the codebase already accepts elsewhere (see
  // awaitSettledTransactions' doc comment) rather than a new one; closing it
  // fully would mean threading an explicit store id through ~40+ query call
  // sites and is out of scope for this feature.
  const previousActiveStoreId = getActiveStoreId();
  setActiveStoreId(null);

  try {
    return await transaction(async () => {
      const sourceProduct = await getSourceProduct(productId, sourceStoreId);
      if (!sourceProduct) {
        throw new Error("Product not found in the source store");
      }

      const batches = await getAvailableSourceBatches(productId);
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
        if (batch.expiry_date && (!earliestExpiry || batch.expiry_date < earliestExpiry)) {
          earliestExpiry = batch.expiry_date;
        }

        await update("stock_batches", batch.id, {
          quantity: batch.quantity - draw,
        });
      }

      const averageCost = totalCost / quantity;

      let destProductId = await findDestProductId(sourceProduct, destStoreId);
      if (!destProductId) {
        destProductId = await createDestProduct(sourceProduct, destStoreId);
      }

      // Always opens a fresh batch on the destination rather than merging
      // into an existing one: the source draw can span multiple batches
      // with different expiry dates, and folding that into an arbitrary
      // pre-existing destination batch would blur its own FEFO ordering.
      // The new batch's expiry is the earliest (most conservative) of
      // everything it was drawn from, so the destination's FEFO picking
      // never overstates shelf life.
      const destBatchId = await insert("stock_batches", {
        product_id: destProductId,
        batch_number: `TRANSFER-${transferId.slice(0, 8).toUpperCase()}`,
        expiry_date: earliestExpiry,
        quantity,
        cost_price: averageCost,
        is_active: 1,
        store_id: destStoreId,
      });

      for (const d of drawn) {
        await insert("stock_movements", {
          product_id: productId,
          stock_batch_id: d.batchId,
          movement_type: "transfer_out",
          quantity: -Math.abs(d.qty),
          unit_cost: d.cost,
          total_cost: d.cost * d.qty,
          reference_id: transferId,
          reference_type: STOCK_TRANSFER_REFERENCE_TYPE,
          reason: reason || `Transfer to ${destStore.name}`,
          performed_by: performedBy,
          movement_date: now,
          store_id: sourceStoreId,
        });
      }

      await insert("stock_movements", {
        product_id: destProductId,
        stock_batch_id: destBatchId,
        movement_type: "transfer_in",
        quantity,
        unit_cost: averageCost,
        total_cost: averageCost * quantity,
        reference_id: transferId,
        reference_type: STOCK_TRANSFER_REFERENCE_TYPE,
        reason: reason || `Transfer from ${sourceStore.name}`,
        performed_by: performedBy,
        movement_date: now,
        store_id: destStoreId,
      });

      return {
        transferId,
        sourceProductId: productId,
        destProductId,
        quantityTransferred: quantity,
        averageCostPrice: averageCost,
      };
    });
  } finally {
    setActiveStoreId(previousActiveStoreId);
  }
}

export interface TransferableProductRow {
  id: string;
  name: string;
  barcode: string | null;
  base_unit: string | null;
  available_quantity: number;
}

/** Products with positive stock in `storeId`, for the transfer dialog's
 * product picker — deliberately takes an explicit store id rather than
 * reading the active-store resolver, since the dialog's chosen source store
 * is very often not the store currently active in the rest of the UI. */
export async function getTransferableProducts(storeId: string): Promise<TransferableProductRow[]> {
  return query<TransferableProductRow>(
    `SELECT p.id, p.name, p.barcode, p.base_unit,
            COALESCE(SUM(sb.quantity), 0) as available_quantity
     FROM products p
     JOIN stock_batches sb ON sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1
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

/**
 * Reconstructs one row per transfer by grouping the transfer_out side of
 * stock_movements on reference_id and joining in its paired transfer_in row
 * — see the header-table decision note at the top of this file for why
 * there's no dedicated table to just SELECT * from instead.
 */
export async function getStockTransferHistory(limit = 100): Promise<StockTransferHistoryRow[]> {
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

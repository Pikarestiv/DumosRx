import { query, insert, update, transaction, isInTransaction } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import { getBatchDeficits } from "@/lib/db/batch-quantity";
import { movementLogIsComplete } from "@/lib/db/sync-engine/stock-auto-heal";
import type { FastMoverRow } from "@/lib/types/fast-mover";
import type { StockBatch, AvailableStockBatch } from "@/lib/types/stock-batch";
import {
  ADJUSTMENT_REFERENCE_TYPE,
  AUDIT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";
import { roundMoney } from "@/lib/utils/pos-calculations";

export async function getAvailableStockBatches() {
  const storeId = getActiveStoreId();
  return query<AvailableStockBatch>(
    `SELECT i.*, m.name as product_name, m.strength as m_strength, m.selling_price FROM stock_batches i JOIN products m ON i.product_id = m.id WHERE i._deleted = 0 AND i.quantity > 0${storeId ? " AND m.store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
}

export async function getBatchTrackingData() {
  const storeId = getActiveStoreId();
  return query<{
    id: string;
    product_name: string;
    batch_number?: string;
    expiry_date?: string;
    quantity: number;
    cost_price?: number;
  }>(
    `SELECT sb.id, p.name as product_name, sb.batch_number, sb.expiry_date, sb.quantity, sb.cost_price FROM stock_batches sb JOIN products p ON sb.product_id = p.id WHERE sb._deleted = 0 AND p._deleted = 0${storeId ? " AND p.store_id = ?" : ""} ORDER BY sb.expiry_date ASC`,
    storeId ? [storeId] : [],
  );
}

export async function getStockBatchesForProductDetails(productId: string) {
  return query<StockBatch>(
    "SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0 ORDER BY expiry_date ASC",
    [productId]
  );
}

export async function getStockBatchById(id: string) {
  const result = await query<StockBatch>("SELECT * FROM stock_batches WHERE id = ?", [id]);
  return result.length > 0 ? result[0] : null;
}

export interface StockOverviewRow {
  id: string;
  product_name: string;
  reorder_level?: number;
  selling_price?: number;
  barcode?: string;
  cost_price?: number;
  quantity: number;
  expiry_date?: string;
  batch_number?: string;
  base_unit?: string;
}

export async function getStockOverviewData() {
  const storeId = getActiveStoreId();
  return query<StockOverviewRow>(
    `SELECT
      p.id, p.name as product_name, p.reorder_level, p.selling_price, p.barcode, p.base_unit,
      sb.avg_cost as cost_price,
      COALESCE(sb.total_qty, 0) as quantity,
      sb.earliest_expiry as expiry_date,
      sb.batches as batch_number
     FROM products p
     LEFT JOIN (
       SELECT product_id,
              SUM(quantity) as total_qty,
              SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost,
              MIN(expiry_date) as earliest_expiry,
              GROUP_CONCAT(batch_number, ', ') as batches
       FROM stock_batches
       WHERE _deleted = 0 AND is_active = 1
       GROUP BY product_id
     ) sb ON p.id = sb.product_id
     WHERE p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
     ORDER BY quantity ASC
     LIMIT 50`,
    storeId ? [storeId] : [],
  );
}

export interface ExpiringItem {
  id: string;
  name: string;
  batch_number: string;
  expiry_date: string;
  stock_quantity: number;
  base_unit?: string;
}

// Excludes deactivated batches and already-expired stock outright (FEFO prioritizes near-expiry stock, it doesn't dispense already-expired sto…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L97
export async function getBatchesForProduct(productId: string) {
  return query<StockBatch>(
    `SELECT * FROM stock_batches
     WHERE product_id = ? AND _deleted = 0 AND is_active = 1 AND quantity > 0
       AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now'))
     ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, created_at ASC`,
    [productId],
  );
}

// Same as getBatchesForProduct but without the `quantity > 0` filter — used where the caller needs to know "does this product have an existing…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L110
export async function getAllActiveBatchesForProduct(productId: string) {
  return query<StockBatch>(
    `SELECT * FROM stock_batches
     WHERE product_id = ? AND _deleted = 0 AND is_active = 1
       AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now'))
     ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, created_at ASC`,
    [productId],
  );
}

// Fallback for sale processing:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L137
export async function getAnyActiveBatchForProduct(
  productId: string,
  options?: { includeExpired?: boolean },
) {
  const expiryFilter = options?.includeExpired
    ? ""
    : " AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now'))";
  return query<StockBatch>(
    `SELECT * FROM stock_batches
     WHERE product_id = ? AND _deleted = 0 AND is_active = 1${expiryFilter}
     ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
    [productId],
  );
}

interface RecordSaleItemStockParams {
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  subtotal: number;
  cashierId: string | null;
  /** Ties this line item's audit_logs rows to the rest of the sale's, so
   * the Activity Log can collapse them into one entry. */
  correlationId?: string;
}

// Inserts the sale_items row for one cart line and deducts/logs the stock it consumed.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L152
export async function recordSaleItemStock(params: RecordSaleItemStockParams) {
  if (isInTransaction()) return writeSaleItemStock(params);
  return transaction(() => writeSaleItemStock(params));
}

async function writeSaleItemStock({
  saleId,
  productId,
  quantity,
  unitPrice,
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

// Same 90-day default as getStockBatchStats / the schema, so an omitted
// argument can never narrow the window below what the UI caption promises.
export async function getExpiringBatches(days: number = 90) {
  const storeId = getActiveStoreId();
  return query<ExpiringItem>(
    `
    SELECT sb.id, p.name, sb.batch_number, sb.expiry_date, sb.quantity as stock_quantity, p.base_unit
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb.expiry_date IS NOT NULL
    AND sb.quantity > 0
    AND sb._deleted = 0
    AND p._deleted = 0
    AND date(sb.expiry_date) <= date('now', '+' || ? || ' days')${storeId ? " AND p.store_id = ?" : ""}
    ORDER BY sb.expiry_date ASC
  `,
    storeId ? [days.toString(), storeId] : [days.toString()],
  );
}

// Population and on-hand rules must stay identical to getStockBatchStats's
// low/critical cases — see client/AGENTS.md, "Low-stock card and its list".
export async function getLowStockAlerts() {
  const storeId = getActiveStoreId();
  return query<{
    product: string;
    quantity: number;
    threshold: number;
    baseUnit: string;
  }>(
    `SELECT
      m.name as product,
      COALESCE(SUM(inv.quantity), 0) as quantity,
      m.reorder_level as threshold,
      m.base_unit as baseUnit
     FROM products m
     LEFT JOIN stock_batches inv ON inv.product_id = m.id
       AND (inv._deleted = 0 OR inv._deleted IS NULL) AND (inv.is_active = 1 OR inv.is_active IS NULL)
       AND (inv.expiry_date IS NULL OR inv.expiry_date = '' OR date(inv.expiry_date) > date('now'))${storeId ? " AND inv.store_id = ?" : ""}
     WHERE (m._deleted = 0 OR m._deleted IS NULL)
       AND (m.is_active = 1 OR m.is_active IS NULL)${storeId ? " AND m.store_id = ?" : ""}
     GROUP BY m.id
     HAVING COALESCE(SUM(inv.quantity), 0) <= m.reorder_level AND m.reorder_level > 0
     ORDER BY COALESCE(SUM(inv.quantity), 0) ASC
     LIMIT 5`,
    storeId ? [storeId, storeId] : [],
  );
}

export async function getExpiryAlerts() {
  const storeId = getActiveStoreId();
  return query<{
    product: string;
    expiryDate: string;
    daysLeft: number;
  }>(
    `SELECT
      m.name as product,
      inv.expiry_date as expiryDate,
      CAST((julianday(inv.expiry_date) - julianday('now')) AS INTEGER) as daysLeft
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE (inv._deleted = 0 OR inv._deleted IS NULL) AND (m._deleted = 0 OR m._deleted IS NULL)
       AND inv.expiry_date IS NOT NULL
       AND inv.expiry_date != ''
       AND julianday(inv.expiry_date) <= julianday('now', '+30 days')
       AND julianday(inv.expiry_date) >= julianday('now')${storeId ? " AND m.store_id = ?" : ""}
     ORDER BY inv.expiry_date ASC
     LIMIT 5`,
    storeId ? [storeId] : [],
  );
}

// Products carrying an oversell shortfall, biggest first, for the dashboard action centre and the stock-batch alerts.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L429
export async function getOversoldAlerts() {
  if (!(await movementLogIsComplete())) return [];

  const deficits = await getBatchDeficits();

  const byProduct = new Map<string, { product: string; quantity: number; movementDate: string }>();
  for (const entry of deficits) {
    const seen = byProduct.get(entry.productId);
    if (seen) {
      seen.quantity += entry.deficit;
      if (entry.lastMovementDate && entry.lastMovementDate > seen.movementDate) {
        seen.movementDate = entry.lastMovementDate;
      }
      continue;
    }
    byProduct.set(entry.productId, {
      product: entry.productName,
      quantity: entry.deficit,
      movementDate: entry.lastMovementDate ?? "",
    });
  }

  return [...byProduct.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
}

export interface StockBatchStatsRow {
  total_products: number;
  active_products: number;
  low_stock_count: number;
  critical_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  missing_expiry_count: number;
  total_stock_batch_value: number;
  active_categories: number;
}

// Default 90, matching `expiry_warning_days INTEGER DEFAULT 90` in the schema and every UI caption/fallback.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L430
export async function getStockBatchStats(expiryDays: number = 90) {
  const storeId = getActiveStoreId();
  const result = await query<StockBatchStatsRow>(
    `SELECT
      COUNT(p.id) AS total_products,
      SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS active_products,
      -- Both require is_active = 1 AND reorder_level > 0, matching the
      -- "Low stock" drill-down list's own HAVING clause below - without
      -- these, critical_stock_count in particular counted every deactivated/
      -- never-restocked product (reorder_level defaults to 0) as needing
      -- reorder, so the card overshot the very list it links to.
      SUM(CASE WHEN p.is_active = 1 AND p.reorder_level > 0 AND COALESCE(sb.total_qty, 0) <= p.reorder_level AND COALESCE(sb.total_qty, 0) > 0 THEN 1 ELSE 0 END) AS low_stock_count,
      SUM(CASE WHEN p.is_active = 1 AND p.reorder_level > 0 AND COALESCE(sb.total_qty, 0) = 0 THEN 1 ELSE 0 END) AS critical_stock_count,
      SUM(COALESCE(sb.expiring_soon, 0)) AS expiring_soon_count,
      SUM(COALESCE(sb.expired, 0)) AS expired_count,
      SUM(COALESCE(sb.missing_expiry, 0)) AS missing_expiry_count,
      COALESCE(SUM(sb.total_value), 0) AS total_stock_batch_value,
      COUNT(DISTINCT p.category_id) as active_categories
    FROM products p
    LEFT JOIN (
      SELECT product_id,
        -- Only active, non-expired stock counts toward "on hand" for the
        -- low/critical stock counts below — the sale path can't dispense an
        -- expired or deactivated batch, so it shouldn't count as available
        -- stock here either (see getBatchesForProduct).
        SUM(CASE WHEN (is_active = 1 OR is_active IS NULL) AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now')) THEN quantity ELSE 0 END) as total_qty,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) > date('now') AND date(expiry_date) <= date('now', '+' || ? || ' days') THEN 1 ELSE 0 END) as expiring_soon,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) <= date('now') THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN (expiry_date IS NULL OR expiry_date = '') AND quantity > 0 THEN 1 ELSE 0 END) as missing_expiry,
        SUM(quantity * cost_price) as total_value
      FROM stock_batches
      -- Scoped to the active store, not just to products of the active store:
      -- filtering only products.store_id on the join let a batch attributed to
      -- another store (or to a store_id-less legacy row) that hangs off one of
      -- this store's products be summed into this store's valuation, on-hand
      -- quantity, and expiry counts. fetchStockBatchReportData and
      -- getBIMetrics's stock_batchValueData both scope stock_batches.store_id
      -- directly (strict equality, no NULL fallback), so the three could
      -- report different inventory values for the same store. The
      -- _deleted predicate needs its own parentheses here, otherwise SQL
      -- precedence turns this into
      -- "_deleted = 0 OR (_deleted IS NULL AND store_id = ?)".
      WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
      GROUP BY product_id
    ) sb ON p.id = sb.product_id
    WHERE (p._deleted = 0 OR p._deleted IS NULL)${storeId ? " AND p.store_id = ?" : ""}`,
    storeId ? [expiryDays.toString(), storeId, storeId] : [expiryDays.toString()],
  );
  return result[0];
}

// Mutations
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

export async function createStockBatch(batch: {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
  expiry_date?: string;
  cost_price?: number;
  store_id?: string;
}) {
  return insert("stock_batches", batch);
}

// Finds a genuinely active, non-expired batch to land newly-found or restored stock into, or creates one if none exists.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L558
export async function getOrCreateTargetBatchForProduct(
  productId: string,
  options: { unitCost: number; batchNumberPrefix?: string },
): Promise<StockBatch> {
  const targets = await getAllActiveBatchesForProduct(productId);
  if (targets.length > 0) return targets[0];

  // store_id is added to `products` via a schema migration rather than the base CREATE TABLE, so a device/test harness that hasn't (or doesn't n…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L517
  const productRows = await query<{ store_id: string | null }>(
    "SELECT store_id FROM products WHERE id = ?",
    [productId],
  ).catch(() => []);
  const newBatchId = crypto.randomUUID();
  const batch: StockBatch = {
    id: newBatchId,
    product_id: productId,
    batch_number: `${options.batchNumberPrefix || "ADJ"}-${new Date().toISOString().slice(0, 10)}`,
    quantity: 0,
    cost_price: options.unitCost,
  };
  const storeId = productRows[0]?.store_id;
  await createStockBatch({
    ...batch,
    batch_number: batch.batch_number!,
    // Only set explicitly when known — an explicit `store_id:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L539
    ...(storeId ? { store_id: storeId } : {}),
  });
  return batch;
}

// The product's live quantity:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-ts-L560
export async function getProductStockQuantity(productId: string): Promise<number> {
  const rows = await query<{ qty: number }>(
    `SELECT COALESCE(SUM(quantity), 0) as qty FROM stock_batches WHERE product_id = ? AND _deleted = 0 AND is_active = 1`,
    [productId],
  );
  return rows[0]?.qty ?? 0;
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

export async function getFastMovers(days: number = 7) {
  // Returned quantities/amounts are netted out of both periods below: a
  // sale that was largely returned shouldn't still count as a "fast mover".
  const storeId = getActiveStoreId();
  const result = await query<FastMoverRow>(
    `WITH current_period AS (
      SELECT
        p.id,
        p.name,
        p.generic_name as genericName,
        p.category_id,
        SUM(si.quantity) as grossQuantity,
        SUM(si.total_price) as grossRevenue,
        COALESCE((
          SELECT SUM(ri.quantity) FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE ri.product_id = p.id AND (ri._deleted = 0 OR ri._deleted IS NULL)
            AND (r._deleted = 0 OR r._deleted IS NULL)
            AND r.created_at >= date('now', '-' || ? || ' days')
        ), 0) as returnedQuantity,
        COALESCE((
          SELECT SUM(ri.subtotal) FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE ri.product_id = p.id AND (ri._deleted = 0 OR ri._deleted IS NULL)
            AND (r._deleted = 0 OR r._deleted IS NULL)
            AND r.created_at >= date('now', '-' || ? || ' days')
        ), 0) as returnedRevenue
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id AND (si._deleted = 0 OR si._deleted IS NULL)
      JOIN products p ON si.product_id = p.id
      WHERE s.created_at >= date('now', '-' || ? || ' days')
        AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND p.store_id = ?" : ""}
      GROUP BY p.id
    ),
    previous_period AS (
      SELECT
        si.product_id,
        SUM(si.quantity) as grossPrevQuantity,
        COALESCE((
          SELECT SUM(ri.quantity) FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE ri.product_id = si.product_id AND (ri._deleted = 0 OR ri._deleted IS NULL)
            AND (r._deleted = 0 OR r._deleted IS NULL)
            AND r.created_at >= date('now', '-' || (? * 2) || ' days')
            AND r.created_at < date('now', '-' || ? || ' days')
        ), 0) as returnedPrevQuantity
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id AND (si._deleted = 0 OR si._deleted IS NULL)
      WHERE s.created_at >= date('now', '-' || (? * 2) || ' days')
        AND s.created_at < date('now', '-' || ? || ' days')
        AND (s._deleted = 0 OR s._deleted IS NULL)
      GROUP BY si.product_id
    )
    SELECT
      c.id, c.name, c.genericName, c.category_id,
      MAX(c.grossQuantity - c.returnedQuantity, 0) as soldQuantity,
      MAX(c.grossRevenue - c.returnedRevenue, 0) as revenue,
      COALESCE(MAX(p.grossPrevQuantity - p.returnedPrevQuantity, 0), 0) as prevQuantity
    FROM current_period c
    LEFT JOIN previous_period p ON c.id = p.product_id
    ORDER BY soldQuantity DESC
    LIMIT 5`,
    // previous_period deliberately carries no store filter of its own:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L914
    storeId
      ? [days.toString(), days.toString(), days.toString(), storeId, days.toString(), days.toString(), days.toString(), days.toString()]
      : [days.toString(), days.toString(), days.toString(), days.toString(), days.toString(), days.toString(), days.toString()]
  );
  
  const items = result.map((row) => {
    let percentageChange = 0;
    if (row.prevQuantity > 0) {
      percentageChange = ((row.soldQuantity - row.prevQuantity) / row.prevQuantity) * 100;
    } else if (row.soldQuantity > 0) {
      percentageChange = 100;
    }
    return { ...row, percentageChange };
  });

  return { items };
}

export async function getStockMoM() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFilter30 = thirtyDaysAgo.toISOString();
  const storeId = getActiveStoreId();
  const movementParams = storeId ? [dateFilter30, storeId] : [dateFilter30];

  // Value added in last 30 days
  const added30 = await query<{ total_added?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_added
    FROM stock_movements
    WHERE created_at >= ? AND movement_type IN ('purchase', 'return', 'transfer_in') AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Value removed in last 30 days
  const removed30 = await query<{ total_removed?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_removed
    FROM stock_movements
    WHERE created_at >= ? AND movement_type IN ('sale', 'adjustment', 'transfer_out') AND (_deleted = 0 OR _deleted IS NULL) AND quantity < 0${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Adjusted additions from positive adjustments
  const positiveAdjustments = await query<{ total_added?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_added
    FROM stock_movements
    WHERE created_at >= ? AND movement_type = 'adjustment' AND (_deleted = 0 OR _deleted IS NULL) AND quantity > 0${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Same population as getStockBatchStats's total_stock_batch_value (every non-deleted batch, no is_active filter):
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L964
  const currentStock = await query<{ total_value?: number }>(`
    SELECT SUM(cost_price * quantity) as total_value
    FROM stock_batches
    WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
  `, storeId ? [storeId] : []);

  const currentVal = currentStock[0]?.total_value || 0;
  const addedVal = (added30[0]?.total_added || 0) + (positiveAdjustments[0]?.total_added || 0);
  const removedVal = removed30[0]?.total_removed || 0;
  const netChange30 = addedVal - removedVal;

  const previousVal = currentVal - netChange30;
  const percentChange = previousVal > 0 ? (netChange30 / previousVal) * 100 : (netChange30 > 0 ? 100 : 0);

  return {
    currentValue: currentVal,
    previousValue: previousVal,
    percentChange: percentChange,
  };
}

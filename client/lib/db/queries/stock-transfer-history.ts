import { query } from "@/lib/db/local-database";
import { STOCK_TRANSFER_REFERENCE_TYPE } from "./stock-transfers";

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

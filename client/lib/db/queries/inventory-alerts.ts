import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import { getBatchDeficits } from "@/lib/db/batch-quantity";
import { movementLogIsComplete } from "@/lib/db/sync-engine/stock-auto-heal";

export interface ExpiringItem {
  id: string;
  name: string;
  batch_number: string;
  expiry_date: string;
  stock_quantity: number;
  base_unit?: string;
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

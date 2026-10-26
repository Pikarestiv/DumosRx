import { query, getActiveStoreId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import { roundMoney } from "@/lib/utils/pos-calculations";
import {
  BACKORDER_REFERENCE_TYPE,
  BACKORDER_SETTLEMENT_REASON,
  BACKORDER_SETTLEMENT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";

export interface OutstandingBackorder {
  productId: string;
  productName: string;
  /** Units sold before stock was received and not yet paid off by a delivery. */
  outstanding: number;
  /** Units settled beyond what was owed (two tills settling at once). */
  overSettled: number;
}

export async function getOutstandingBackorders(productIds?: string[]): Promise<OutstandingBackorder[]> {
  const storeId = getActiveStoreId();
  const productFilter = productIds?.length ? ` AND sm.product_id IN (${productIds.map(() => "?").join(", ")})` : "";
  const rows = await query<{ product_id: string; product_name: string; owed: number; settled: number }>(
    `SELECT sm.product_id, p.name AS product_name,
            SUM(CASE WHEN sm.reference_type = ? THEN sm.quantity ELSE 0 END) AS owed,
            SUM(CASE WHEN sm.reference_type = ? THEN ABS(sm.quantity) ELSE 0 END) AS settled
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
      WHERE sm._deleted = 0 AND p._deleted = 0 AND sm.reference_type IN (?, ?)${storeId ? " AND p.store_id = ?" : ""}${productFilter}
      GROUP BY sm.product_id
     HAVING owed <> settled
      ORDER BY p.name`,
    [
      BACKORDER_REFERENCE_TYPE, BACKORDER_SETTLEMENT_REFERENCE_TYPE,
      BACKORDER_REFERENCE_TYPE, BACKORDER_SETTLEMENT_REFERENCE_TYPE,
      ...(storeId ? [storeId] : []), ...(productIds ?? []),
    ],
  );
  return rows.map((r) => {
    const balance = Number(r.owed) - Number(r.settled);
    return {
      productId: r.product_id,
      productName: r.product_name,
      outstanding: Math.max(0, balance),
      overSettled: Math.max(0, -balance),
    };
  });
}

export interface UnsettledSale {
  saleId: string;
  units: number;
  estimatedUnitCost: number;
}

export async function getUnsettledSales(productId: string): Promise<UnsettledSale[]> {
  const rows = await query<{ reference_id: string; quantity: number; unit_cost: number | null; reference_type: string }>(
    `SELECT reference_id, quantity, unit_cost, reference_type FROM stock_movements
      WHERE product_id = ? AND _deleted = 0 AND reference_type IN (?, ?)
      ORDER BY movement_date, created_at, rowid`,
    [productId, BACKORDER_REFERENCE_TYPE, BACKORDER_SETTLEMENT_REFERENCE_TYPE],
  );

  const bySale = new Map<string, { units: number; owedUnits: number; costSum: number }>();
  let settled = 0;
  for (const r of rows) {
    const quantity = Number(r.quantity);
    if (r.reference_type === BACKORDER_SETTLEMENT_REFERENCE_TYPE) {
      settled += Math.abs(quantity);
      continue;
    }
    const sale = bySale.get(r.reference_id) ?? { units: 0, owedUnits: 0, costSum: 0 };
    sale.units += quantity;
    if (quantity > 0) {
      sale.owedUnits += quantity;
      sale.costSum += quantity * Number(r.unit_cost ?? 0);
    }
    bySale.set(r.reference_id, sale);
  }

  const unsettled: UnsettledSale[] = [];
  for (const [saleId, sale] of bySale) {
    const paidOff = Math.min(Math.max(0, sale.units), settled);
    settled -= paidOff;
    const units = sale.units - paidOff;
    if (units <= 0) continue;
    unsettled.push({ saleId, units, estimatedUnitCost: sale.owedUnits ? sale.costSum / sale.owedUnits : 0 });
  }
  return unsettled;
}

async function recostSettledSales(productId: string, sales: UnsettledSale[], settle: number, actualUnitCost: number) {
  let left = settle;
  for (const sale of sales) {
    if (left <= 0) break;
    const units = Math.min(sale.units, left);
    left -= units;
    if (actualUnitCost === sale.estimatedUnitCost) continue;

    const lines = await query<{ id: string; quantity: number; cost_price: number | null }>(
      "SELECT id, quantity, cost_price FROM sale_items WHERE sale_id = ? AND product_id = ? AND _deleted = 0",
      [sale.saleId, productId],
    );
    const lineUnits = lines.reduce((sum, l) => sum + Number(l.quantity), 0);
    if (lineUnits <= 0) continue;
    const shift = (units * (actualUnitCost - sale.estimatedUnitCost)) / lineUnits;
    for (const l of lines) {
      await update("sale_items", l.id, { cost_price: roundMoney(Number(l.cost_price ?? 0) + shift) });
    }
  }
}

export interface ReceiptSettlement {
  movementId: string;
  productId: string;
  batchId: string;
  receivedUnits: number;
  unitCost: number;
  purchaseOrderId: string;
  performedBy: string | null;
  movementDate: string;
}

export async function settleBackordersOnReceipt(r: ReceiptSettlement): Promise<number> {
  const sales = await getUnsettledSales(r.productId);
  const owed = sales.reduce((sum, s) => sum + s.units, 0);
  const settle = Math.min(owed, r.receivedUnits);
  if (settle <= 0) return 0;

  await recostSettledSales(r.productId, sales, settle, r.unitCost);
  await insert("stock_movements", {
    id: r.movementId,
    product_id: r.productId,
    stock_batch_id: r.batchId,
    movement_type: "adjustment",
    quantity: -settle,
    unit_cost: r.unitCost,
    total_cost: roundMoney(r.unitCost * settle),
    reference_id: r.purchaseOrderId,
    reference_type: BACKORDER_SETTLEMENT_REFERENCE_TYPE,
    reason: BACKORDER_SETTLEMENT_REASON,
    performed_by: r.performedBy,
    movement_date: r.movementDate,
  });
  return settle;
}

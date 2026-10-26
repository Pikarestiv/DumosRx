import { query, getActiveStoreId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { receiptSettlementMovementId } from "@/lib/db/deterministic-id";
import {
  ADJUSTMENT_REASON_NOTE_SEPARATOR,
  BACKORDER_REFERENCE_TYPE,
  BACKORDER_SETTLEMENT_REASON,
  BACKORDER_SETTLEMENT_REFERENCE_TYPE,
} from "@/lib/constants/stock-adjustments";

export interface OutstandingBackorder {
  productId: string;
  productName: string;
  /** Units sold before stock was received and not yet paid off by a delivery. */
  outstanding: number;
}

export interface UnsettledSale {
  saleId: string;
  units: number;
  estimatedUnitCost: number;
}

interface LedgerRow {
  product_id: string;
  product_name?: string;
  reference_id: string;
  reference_type: string;
  quantity: number;
  unit_cost: number | null;
  movement_date: string | null;
}

interface SaleBalance {
  owedUnits: number;
  costSum: number;
  settlements: { units: number; unitCost: number }[];
}

function ledgerBySale(rows: LedgerRow[]): Map<string, SaleBalance> {
  const bySale = new Map<string, SaleBalance>();
  for (const r of rows) {
    if (r.reference_type !== BACKORDER_REFERENCE_TYPE) continue;
    const quantity = Number(r.quantity);
    const sale = bySale.get(r.reference_id) ?? { owedUnits: 0, costSum: 0, settlements: [] };
    sale.owedUnits += quantity;
    sale.costSum += quantity * Number(r.unit_cost ?? 0);
    bySale.set(r.reference_id, sale);
  }
  for (const r of rows) {
    if (r.reference_type !== BACKORDER_SETTLEMENT_REFERENCE_TYPE) continue;
    bySale.get(r.reference_id)?.settlements.push({ units: Math.abs(Number(r.quantity)), unitCost: Number(r.unit_cost ?? 0) });
  }
  return bySale;
}

const roundUnits = (units: number) => Math.round(units * 1e6) / 1e6;
const estimateOf = (sale: SaleBalance) => (sale.owedUnits ? sale.costSum / sale.owedUnits : 0);
const settledUnitsOf = (sale: SaleBalance) => sale.settlements.reduce((sum, s) => sum + s.units, 0);

function unsettledFromLedger(rows: LedgerRow[]): UnsettledSale[] {
  return [...ledgerBySale(rows)]
    .map(([saleId, sale]) => ({
      saleId,
      units: roundUnits(sale.owedUnits - settledUnitsOf(sale)),
      estimatedUnitCost: estimateOf(sale),
    }))
    .filter((sale) => sale.units > 0);
}

function lineCostFromLedger(sale: SaleBalance, lineUnits: number): number {
  const estimate = estimateOf(sale);
  let budget = sale.owedUnits;
  let shift = 0;
  for (const s of sale.settlements) {
    const units = Math.min(s.units, budget);
    budget -= units;
    if (s.unitCost > 0) shift += units * (s.unitCost - estimate);
  }
  return roundMoney(estimate + shift / lineUnits);
}

const LEDGER_ORDER = "ORDER BY sm.movement_date, sm.created_at, sm.rowid";

export async function getOutstandingBackorders(productIds?: string[]): Promise<OutstandingBackorder[]> {
  const storeId = getActiveStoreId();
  const productFilter = productIds?.length ? ` AND sm.product_id IN (${productIds.map(() => "?").join(", ")})` : "";
  const rows = await query<LedgerRow>(
    `SELECT sm.product_id, p.name AS product_name, sm.reference_id, sm.reference_type, sm.quantity, sm.unit_cost, sm.movement_date
       FROM stock_movements sm
       JOIN products p ON p.id = sm.product_id
      WHERE sm._deleted = 0 AND p._deleted = 0 AND sm.reference_type IN (?, ?)${storeId ? " AND p.store_id = ?" : ""}${productFilter}
      ${LEDGER_ORDER}`,
    [BACKORDER_REFERENCE_TYPE, BACKORDER_SETTLEMENT_REFERENCE_TYPE, ...(storeId ? [storeId] : []), ...(productIds ?? [])],
  );

  const byProduct = new Map<string, LedgerRow[]>();
  for (const r of rows) byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r]);

  const result: OutstandingBackorder[] = [];
  for (const [productId, ledger] of byProduct) {
    const outstanding = roundUnits(unsettledFromLedger(ledger).reduce((sum, s) => sum + s.units, 0));
    if (outstanding > 0) result.push({ productId, productName: ledger[0].product_name ?? "", outstanding });
  }
  return result.sort((a, b) => a.productName.localeCompare(b.productName));
}

function ledgerRowsFor(productId: string): Promise<LedgerRow[]> {
  return query<LedgerRow>(
    `SELECT sm.product_id, sm.reference_id, sm.reference_type, sm.quantity, sm.unit_cost, sm.movement_date
       FROM stock_movements sm
      WHERE sm.product_id = ? AND sm._deleted = 0 AND sm.reference_type IN (?, ?)
      ${LEDGER_ORDER}`,
    [productId, BACKORDER_REFERENCE_TYPE, BACKORDER_SETTLEMENT_REFERENCE_TYPE],
  );
}

export async function getUnsettledSales(productId: string): Promise<UnsettledSale[]> {
  return unsettledFromLedger(await ledgerRowsFor(productId));
}

async function recostSale(productId: string, saleId: string) {
  const sale = ledgerBySale(await ledgerRowsFor(productId)).get(saleId);
  if (!sale) return;
  const lines = await query<{ id: string; quantity: number; cost_price: number | null }>(
    "SELECT id, quantity, cost_price FROM sale_items WHERE sale_id = ? AND product_id = ? AND _deleted = 0",
    [saleId, productId],
  );
  const lineUnits = lines.reduce((sum, l) => sum + Number(l.quantity), 0);
  if (lineUnits <= 0) return;
  const cost = lineCostFromLedger(sale, lineUnits);
  for (const l of lines) {
    if (Number(l.cost_price ?? 0) !== cost) await update("sale_items", l.id, { cost_price: cost });
  }
}

export interface ReceiptSettlement {
  poItemId: string;
  alreadyReceived: number;
  productId: string;
  batchId: string;
  receivedUnits: number;
  unitCost: number;
  purchaseOrderId: string;
  performedBy: string | null;
  movementDate: string;
}

export async function settleBackordersOnReceipt(r: ReceiptSettlement): Promise<number> {
  let left = r.receivedUnits;
  for (const sale of await getUnsettledSales(r.productId)) {
    if (left <= 0) break;
    const units = Math.min(sale.units, left);
    left = roundUnits(left - units);
    await insert("stock_movements", {
      id: receiptSettlementMovementId(r.poItemId, r.alreadyReceived, sale.saleId),
      product_id: r.productId,
      stock_batch_id: r.batchId,
      movement_type: "adjustment",
      quantity: -units,
      unit_cost: r.unitCost,
      total_cost: roundMoney(r.unitCost * units),
      reference_id: sale.saleId,
      reference_type: BACKORDER_SETTLEMENT_REFERENCE_TYPE,
      reason: `${BACKORDER_SETTLEMENT_REASON}${ADJUSTMENT_REASON_NOTE_SEPARATOR}${r.purchaseOrderId}`,
      performed_by: r.performedBy,
      movement_date: r.movementDate,
    });
    await recostSale(r.productId, sale.saleId);
  }
  return roundUnits(r.receivedUnits - left);
}

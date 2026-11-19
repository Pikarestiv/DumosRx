import { query } from "./core";
import { getUnresolvedConflicts } from "./sync-engine/conflict-log";

interface FingerprintHeader {
  supplier_id?: string | null;
  notes?: string | null;
  amount_paid?: number | string | null;
  due_date?: string | null;
}

interface FingerprintLine {
  id?: string | null;
  product_id: string;
  bulk_quantity: number | string | null;
  units_per_bulk?: number | string | null;
  unit_cost?: number | string | null;
  cost_price_override?: number | string | null;
  lot_number?: string | null;
  expiry_date?: string | null;
}

const text = (value: unknown) => (value == null ? "" : String(value).trim());
const day = (value: unknown) => text(value).slice(0, 10);
const amount = (value: unknown) => {
  if (value == null || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed * 10000) / 10000) : text(value);
};

export function draftFingerprintOf(header: FingerprintHeader, lines: FingerprintLine[]): string {
  const normalisedLines = lines
    .map((line) => [
      text(line.id),
      text(line.product_id),
      amount(line.bulk_quantity),
      amount(line.units_per_bulk),
      amount(line.unit_cost),
      amount(line.cost_price_override),
      text(line.lot_number),
      day(line.expiry_date),
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify([text(header.supplier_id), text(header.notes), amount(header.amount_paid ?? 0), day(header.due_date), normalisedLines]);
}

export async function storedDraftFingerprint(orderId: string): Promise<string> {
  const [header] = await query<FingerprintHeader>(
    "SELECT supplier_id, notes, amount_paid, due_date FROM purchase_orders WHERE id = ?",
    [orderId],
  );
  const lines = await query<FingerprintLine>(
    `SELECT id, product_id, bulk_quantity, units_per_bulk, unit_cost, cost_price_override, lot_number, expiry_date
     FROM purchase_order_items WHERE po_id = ? AND _deleted = 0`,
    [orderId],
  );
  return draftFingerprintOf(header ?? {}, lines);
}

export async function hasUnresolvedOrderConflicts(orderId: string): Promise<boolean> {
  const lines = await query<{ id: string }>("SELECT id FROM purchase_order_items WHERE po_id = ?", [orderId]);
  const conflicts = [
    ...(await getUnresolvedConflicts("purchase_orders", [orderId])),
    ...(await getUnresolvedConflicts("purchase_order_items", lines.map((line) => line.id))),
  ];
  return conflicts.length > 0;
}

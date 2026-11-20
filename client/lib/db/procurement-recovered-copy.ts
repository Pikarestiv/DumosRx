import { query, logAction } from "./core";
import { AUDIT_ACTIONS } from "./audit-actions";
import { insert } from "./base-helpers";
import { deterministicId } from "./deterministic-id";
import { ORDER_TYPE_WRITTEN_FOR_OLD_TILLS } from "./procurement";
import { storedDraftFingerprint } from "./procurement-draft-fingerprint";
import { getStoredUser } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { immediateLineAmount } from "@/components/procurement/po-line-item-math";
import type { SyncChange } from "@/lib/types/sync";

export const RECOVERED_COPY_NOTE_PREFIX = "Recovered copy of ";

const RECOVERABLE_REASONS = new Set(["version_conflict", "stale_timestamp", "draft_locked"]);
const RECOVERABLE_STATUSES = new Set(["pending", "sent"]);
const NON_CONTENT_HEADER_KEYS = new Set([
  "id", "updated_at", "store_id", "type", "payment_status", "total_amount", "status",
  "editing_device_id", "editing_device_label", "editing_user_id", "editing_at",
]);

export interface RecoveredCopy {
  id: string;
  sourceLabel: string;
}

interface FailedChange {
  id?: number | null;
  table_name: string;
  record_id: string;
  reason: string;
}

interface OrderRow {
  id: string;
  supplier_id: string | null;
  notes: string | null;
  due_date: string | null;
  status: string;
  _deleted: number | null;
}

interface LineRow {
  id: string;
  product_id: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  selling_price: number | null;
  cost_price_override: number | null;
  lot_number: string | null;
  expiry_date: string | null;
}

export function orderLabel(orderId: string): string {
  return `PO-${orderId.split("-")[0].toUpperCase()}`;
}

function carriesOrderContent(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((key) => !key.startsWith("_") && !NON_CONTENT_HEADER_KEYS.has(key));
}

export async function ordersWithRejectedEdits(failed: FailedChange[], changes: SyncChange[]): Promise<string[]> {
  const orderIds = new Set<string>();
  for (const f of failed) {
    if (!RECOVERABLE_REASONS.has(f.reason)) continue;
    const payload = changes.find((change) => change.id === f.id)?.payload ?? {};
    if (f.table_name === "purchase_orders" && carriesOrderContent(payload)) orderIds.add(f.record_id);
    if (f.table_name === "purchase_order_items") {
      const [line] = await query<{ po_id: string }>("SELECT po_id FROM purchase_order_items WHERE id = ?", [f.record_id]);
      const poId = line?.po_id ?? (typeof payload.po_id === "string" ? payload.po_id : null);
      if (poId) orderIds.add(poId);
    }
  }
  return [...orderIds];
}

export async function preserveRejectedOrderEdits(orderIds: string[]): Promise<RecoveredCopy[]> {
  const recovered: RecoveredCopy[] = [];
  for (const orderId of orderIds) {
    const copy = await copyOrderAsRecovered(orderId);
    if (copy) recovered.push(copy);
  }
  return recovered;
}

async function copyOrderAsRecovered(orderId: string): Promise<RecoveredCopy | null> {
  const [order] = await query<OrderRow>(
    "SELECT id, supplier_id, notes, due_date, status, _deleted FROM purchase_orders WHERE id = ?",
    [orderId],
  );
  if (!order || order._deleted || !RECOVERABLE_STATUSES.has(order.status)) return null;
  const lines = await query<LineRow>(
    `SELECT id, product_id, bulk_quantity, units_per_bulk, unit_cost, selling_price, cost_price_override, lot_number, expiry_date
     FROM purchase_order_items WHERE po_id = ? AND _deleted = 0`,
    [orderId],
  );
  if (lines.length === 0) return null;

  const copyId = deterministicId("po_recovered_copy", orderId, await storedDraftFingerprint(orderId));
  const [existing] = await query<{ id: string }>("SELECT id FROM purchase_orders WHERE id = ?", [copyId]);
  if (existing) return null;

  const sourceLabel = orderLabel(orderId);
  const now = new Date().toISOString();
  const note = `${RECOVERED_COPY_NOTE_PREFIX}${sourceLabel}${order.notes ? `: ${order.notes}` : ""}`;
  await insert("purchase_orders", {
    id: copyId,
    supplier_id: order.supplier_id,
    status: "pending",
    type: ORDER_TYPE_WRITTEN_FOR_OLD_TILLS,
    ordered_by: getStoredUser()?.id ?? null,
    payment_status: "unpaid",
    amount_paid: 0,
    due_date: order.due_date,
    total_amount: roundMoney(lines.reduce((sum, line) => sum + roundMoney(immediateLineAmount(line)), 0)),
    notes: note,
    created_at: now,
  }, { skipAudit: true });
  for (const line of lines) {
    await insert("purchase_order_items", {
      ...line,
      id: deterministicId("po_recovered_line", copyId, line.id),
      po_id: copyId,
      quantity_received: 0,
      subtotal: roundMoney(immediateLineAmount(line)),
      created_at: now,
    }, { skipAudit: true });
  }
  await logAction(AUDIT_ACTIONS.PO_RECOVERED_COPY, "purchase_orders", copyId, { source_order_id: orderId, item_count: lines.length });
  return { id: copyId, sourceLabel };
}

export async function getRecoveredCopies(): Promise<{ id: string; notes: string }[]> {
  return query<{ id: string; notes: string }>(
    `SELECT id, notes FROM purchase_orders
     WHERE status = 'pending' AND _deleted = 0 AND notes LIKE ?
     ORDER BY created_at DESC LIMIT 20`,
    [`${RECOVERED_COPY_NOTE_PREFIX}PO-%`],
  );
}

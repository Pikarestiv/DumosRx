import { query, transaction, logAction } from "./core";
import { insert, update } from "./base-helpers";
import { reconcilePurchaseOrderLines } from "./procurement-line-diff";
import { ORDER_TYPE_WRITTEN_FOR_OLD_TILLS, type DraftPOLineItem } from "./procurement";
import { AUDIT_ACTIONS } from "./audit-actions";
import { getStoredUser } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { immediateLineAmount } from "@/components/procurement/po-line-item-math";

export interface DraftOrderSnapshot {
  id: string;
  supplierId: string | null;
  notes: string;
  items: DraftPOLineItem[];
  paymentStatus: string;
  amountPaid: number;
  dueDate: string | null;
}

export type DraftSaveOutcome = "created" | "updated" | "unchanged" | "not_editable" | "deleted";

export interface DraftSaveResult {
  outcome: DraftSaveOutcome;
  lineIdMap: Map<string, string>;
}

const EDITABLE_STATUSES = new Set(["pending", "sent"]);

interface StoredHeader {
  status: string;
  supplier_id: string | null;
  notes: string | null;
  payment_status: string | null;
  amount_paid: number | null;
  due_date: string | null;
  total_amount: number | null;
  _deleted: number | null;
}

function orderTotal(items: DraftPOLineItem[]): number {
  return roundMoney(items.reduce((sum, item) => sum + roundMoney(immediateLineAmount(item)), 0));
}

function headerFields(snapshot: DraftOrderSnapshot) {
  return {
    supplier_id: snapshot.supplierId,
    notes: snapshot.notes,
    payment_status: snapshot.paymentStatus,
    amount_paid: snapshot.amountPaid,
    due_date: snapshot.dueDate,
    total_amount: orderTotal(snapshot.items),
  };
}

function headerChanged(stored: StoredHeader, next: ReturnType<typeof headerFields>): boolean {
  return (
    (stored.supplier_id ?? null) !== next.supplier_id ||
    (stored.notes ?? "") !== next.notes ||
    (stored.payment_status ?? "unpaid") !== next.payment_status ||
    Number(stored.amount_paid ?? 0) !== next.amount_paid ||
    (stored.due_date ?? null) !== next.due_date ||
    Number(stored.total_amount ?? 0) !== next.total_amount
  );
}

async function createDraft(snapshot: DraftOrderSnapshot, now: string): Promise<Map<string, string>> {
  await insert("purchase_orders", {
    id: snapshot.id,
    status: "pending",
    type: ORDER_TYPE_WRITTEN_FOR_OLD_TILLS,
    ordered_by: getStoredUser()?.id ?? null,
    created_at: now,
    ...headerFields(snapshot),
  });
  const { idMap } = await reconcilePurchaseOrderLines(snapshot.id, snapshot.items, now, { skipAudit: true });
  return idMap;
}

export async function saveDraftOrder(snapshot: DraftOrderSnapshot): Promise<DraftSaveResult> {
  return transaction(async () => {
    const now = new Date().toISOString();
    const [stored] = await query<StoredHeader>(
      `SELECT status, supplier_id, notes, payment_status, amount_paid, due_date, total_amount, _deleted
       FROM purchase_orders WHERE id = ?`,
      [snapshot.id],
    );

    if (!stored) {
      if (snapshot.items.length === 0) return { outcome: "unchanged", lineIdMap: new Map() };
      return { outcome: "created", lineIdMap: await createDraft(snapshot, now) };
    }
    if (stored._deleted) return { outcome: "deleted", lineIdMap: new Map() };
    if (!EDITABLE_STATUSES.has(stored.status)) return { outcome: "not_editable", lineIdMap: new Map() };

    const header = headerFields(snapshot);
    const changedHeader = headerChanged(stored, header);
    if (changedHeader) {
      await update("purchase_orders", snapshot.id, { ...header, type: ORDER_TYPE_WRITTEN_FOR_OLD_TILLS }, { skipAudit: true });
    }
    const { idMap: lineIdMap, writes } = await reconcilePurchaseOrderLines(snapshot.id, snapshot.items, now, { skipAudit: true });

    if (!changedHeader && writes === 0) return { outcome: "unchanged", lineIdMap };
    await logAction(AUDIT_ACTIONS.PO_DRAFT_EDITED, "purchase_orders", snapshot.id, {
      item_count: snapshot.items.length,
      total_amount: header.total_amount,
    });
    return { outcome: "updated", lineIdMap };
  });
}

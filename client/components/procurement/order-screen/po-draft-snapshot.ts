import type { PurchaseOrder } from "@/lib/db/procurement";
import type { DraftLockHolder, DraftOrderSnapshot } from "@/lib/db/procurement-draft";
import { SELF_PURCHASE_VENDOR_ID } from "../po-details-fields";
import { dueDateToSave, getOrderTotal, getValidatedAmountPaid } from "../po-line-item-math";
import type { POLineItemDraft } from "../po-item-ledger-table";
import type { PoDraft } from "./po-draft-state";

export function newDraft(supplierId: string = SELF_PURCHASE_VENDOR_ID): PoDraft {
  return {
    supplierId,
    notes: "",
    items: [],
    paymentStatus: supplierId === SELF_PURCHASE_VENDOR_ID ? "paid" : "unpaid",
    amountPaid: "",
    dueDate: "",
    paymentTouched: false,
  };
}

export function draftFromOrder(po: PurchaseOrder): PoDraft {
  return {
    supplierId: po.supplier_id || SELF_PURCHASE_VENDOR_ID,
    notes: po.notes || "",
    items: (po.items || []) as POLineItemDraft[],
    paymentStatus: po.payment_status || "unpaid",
    amountPaid: po.amount_paid ? String(po.amount_paid) : "",
    dueDate: po.due_date || "",
    paymentTouched: true,
  };
}

export function withSupplier(draft: PoDraft, supplierId: string): PoDraft {
  const paymentStatus = draft.paymentTouched
    ? draft.paymentStatus
    : supplierId === SELF_PURCHASE_VENDOR_ID ? "paid" : "unpaid";
  return { ...draft, supplierId, paymentStatus };
}

export function amountPaidToSave(draft: PoDraft, total: number): number {
  if (draft.paymentStatus === "unpaid") return 0;
  if (draft.paymentStatus === "paid") return total;
  return getValidatedAmountPaid(draft.amountPaid, total);
}

export function toSnapshot(id: string, draft: PoDraft, lock?: DraftLockHolder, takeOver = false): DraftOrderSnapshot {
  const total = getOrderTotal(draft.items);
  return {
    id,
    supplierId: draft.supplierId === SELF_PURCHASE_VENDOR_ID ? null : draft.supplierId,
    notes: draft.notes,
    items: draft.items,
    paymentStatus: draft.paymentStatus,
    amountPaid: amountPaidToSave(draft, total),
    dueDate: dueDateToSave(draft.paymentStatus, draft.dueDate),
    lock,
    takeOver,
  };
}

export function remapLineIds(draft: PoDraft, idMap: Map<string, string>): PoDraft {
  if (idMap.size === 0) return draft;
  return { ...draft, items: draft.items.map((item) => (item.id && idMap.has(item.id) ? { ...item, id: idMap.get(item.id) } : item)) };
}

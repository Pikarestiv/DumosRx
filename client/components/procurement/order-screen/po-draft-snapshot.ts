import type { PurchaseOrder } from "@/lib/db/procurement";
import type { DraftLockHolder, DraftOrderSnapshot } from "@/lib/db/procurement-draft";
import { SELF_PURCHASE_VENDOR_ID } from "../po-details-fields";
import { dueDateToSave, getOrderTotal } from "../po-line-item-math";
import { amountPaidForSave, derivePaymentStatus, effectiveAmountPaid } from "../po-payment";
import type { POLineItemDraft } from "../po-item-ledger-table";
import type { PoDraft } from "./po-draft-state";

export function newDraft(supplierId: string = SELF_PURCHASE_VENDOR_ID): PoDraft {
  return {
    supplierId,
    notes: "",
    items: [],
    paidInFull: supplierId === SELF_PURCHASE_VENDOR_ID,
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
    paidInFull: false,
    amountPaid: String(effectiveAmountPaid(po) || ""),
    dueDate: po.due_date || "",
    paymentTouched: true,
  };
}

export function withSupplier(draft: PoDraft, supplierId: string): PoDraft {
  const paidInFull = draft.paymentTouched ? draft.paidInFull : supplierId === SELF_PURCHASE_VENDOR_ID;
  return { ...draft, supplierId, paidInFull };
}

export function toSnapshot(id: string, draft: PoDraft, lock?: DraftLockHolder, takeOver = false): DraftOrderSnapshot {
  const total = getOrderTotal(draft.items);
  const amountPaid = amountPaidForSave(draft, total);
  const paymentStatus = derivePaymentStatus(amountPaid, total);
  return {
    id,
    supplierId: draft.supplierId === SELF_PURCHASE_VENDOR_ID ? null : draft.supplierId,
    notes: draft.notes,
    items: draft.items,
    paymentStatus,
    amountPaid,
    dueDate: dueDateToSave(paymentStatus, draft.dueDate),
    lock,
    takeOver,
  };
}

export function remapLineIds(draft: PoDraft, idMap: Map<string, string>): PoDraft {
  if (idMap.size === 0) return draft;
  return { ...draft, items: draft.items.map((item) => (item.id && idMap.has(item.id) ? { ...item, id: idMap.get(item.id) } : item)) };
}

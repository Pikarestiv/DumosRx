import { useMutation } from "@tanstack/react-query";
import {
  createPurchaseOrder,
  createAndReceivePurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/db/procurement";
import type { DraftPOLineItem, ImmediateLineItemDraft } from "@/lib/db/procurement";

interface CreatePurchaseOrderParams {
  supplierId: string | null;
  notes: string;
  items: DraftPOLineItem[];
  paymentStatus?: string;
  amountPaid?: number;
  dueDate?: string | null;
  type?: "standard" | "immediate";
}

/** Shared by every "save as draft" call site (Standard PO, and an Immediate
 * Purchase parked as a draft instead of received right away) — both go
 * through the same underlying createPurchaseOrder() call. Each caller
 * supplies its own onSuccess for its own toast wording / navigation. */
export function useCreatePurchaseOrderMutation() {
  return useMutation({
    mutationFn: ({
      supplierId,
      notes,
      items,
      paymentStatus,
      amountPaid,
      dueDate,
      type,
    }: CreatePurchaseOrderParams) =>
      createPurchaseOrder(supplierId, notes, items, paymentStatus, amountPaid, dueDate, type),
  });
}

interface CreateAndReceivePurchaseOrderParams {
  supplierId: string | null;
  notes: string;
  items: ImmediateLineItemDraft[];
  paymentStatus?: string;
  amountPaid?: number;
  dueDate?: string | null;
}

export function useCreateAndReceivePurchaseOrderMutation() {
  return useMutation({
    mutationFn: ({
      supplierId,
      notes,
      items,
      paymentStatus,
      amountPaid,
      dueDate,
    }: CreateAndReceivePurchaseOrderParams) =>
      createAndReceivePurchaseOrder(supplierId, notes, items, paymentStatus, amountPaid, dueDate),
  });
}

interface UpdatePurchaseOrderParams {
  poId: string;
  supplierId: string | null;
  notes: string;
  items: DraftPOLineItem[];
  paymentStatus?: string;
  amountPaid?: number;
  dueDate?: string | null;
}

export function useUpdatePurchaseOrderMutation() {
  return useMutation({
    mutationFn: ({
      poId,
      supplierId,
      notes,
      items,
      paymentStatus,
      amountPaid,
      dueDate,
    }: UpdatePurchaseOrderParams) =>
      updatePurchaseOrder(poId, supplierId, notes, items, paymentStatus, amountPaid, dueDate),
  });
}

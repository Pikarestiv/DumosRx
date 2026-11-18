"use client";

import { POImmediateConfirmDialog } from "./po-immediate-confirm-dialog";
import type { PurchaseOrder, PurchaseOrderItem } from "@/lib/db/procurement";
import type { ReceivedItemPayload } from "./receive-po-panel";

interface PODraftReceiveDialogProps {
  po: PurchaseOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceive: (id: string, items: ReceivedItemPayload[]) => void;
}

export function draftReceiptItems(items: PurchaseOrderItem[]): ReceivedItemPayload[] {
  return items.map((item) => ({
    po_item_id: item.id,
    product_id: item.product_id,
    quantity: Number(item.bulk_quantity) || 0,
    lot_number: item.lot_number ?? "",
    expiry_date: item.expiry_date ?? "",
    cost_price: item.cost_price_override ?? undefined,
    current_selling_price: item.current_selling_price ?? null,
  }));
}

export function PODraftReceiveDialog({ po, open, onOpenChange, onReceive }: PODraftReceiveDialogProps) {
  const items = po.items ?? [];
  const counted = items.filter((item) => Number(item.bulk_quantity) > 0);
  const skipped = items.filter((item) => !(Number(item.bulk_quantity) > 0));
  const products = items.map((item) => ({
    id: item.product_id,
    selling_price: item.current_selling_price,
    cost_price: item.last_bought_price ?? item.current_cost_price,
  }));

  return (
    <POImmediateConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      items={counted}
      skippedItems={skipped}
      products={products}
      totalAmount={Number(po.total_amount) || 0}
      onConfirm={() => onReceive(po.id, draftReceiptItems(items))}
    />
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

import { ReceiveLedgerTable } from "./receive-ledger-table";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { ReceiveItemCard } from "./receive-item-card";
import type { PurchaseOrder, PurchaseOrderItem } from "@/lib/db/local-database";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { outstandingBulkQuantity } from "./po-line-item-math";

export interface ReceivedItemPayload {
  po_item_id: string;
  product_id: string;
  quantity: number;
  lot_number?: string;
  expiry_date?: string;
  cost_price?: string | number;
  selling_price?: string | number;
  /** The product's live selling_price when this panel was opened - carried
   * through unedited so the caller can tell whether a selling_price above
   * is a real change or a no-op re-submission of the current price. */
  current_selling_price?: number | null;
}

interface ReceivePOPanelProps {
  po: PurchaseOrder | null;
  onBack: () => void;
  onConfirm: (poId: string, receivedItems: ReceivedItemPayload[]) => void;
  /** True while the caller's receive is in flight — locks "Confirm &
   * Receive" so a double-tap can't receive the same order twice. */
  isReceiving?: boolean;
}

/** Embedded, full-height replacement for the old Receive Goods modal. It
 * takes over the same side panel used for PO details so the ledger table
 * gets the panel's full width/height instead of being cramped inside a
 * centered dialog. */
export function ReceivePOPanel({
  po,
  onBack,
  onConfirm,
  isReceiving = false,
}: ReceivePOPanelProps) {
  const [receivedItems, setReceivedItems] = useState<
    Record<string, ReceivedItemPayload>
  >({});
  const [showWarningModal, setShowWarningModal] = useState(false);
  // Ledger needs room for a dense multi-column table. Tablet and up have
  // it, phones get the one-item-at-a-time card flow instead.
  const isTabletUp = useMediaQuery("(min-width: 640px)");
  const mode = isTabletUp ? "ledger" : "standard";

  useEffect(() => {
    if (!po) return;
    const initial: Record<string, ReceivedItemPayload> = {};
    po.items?.forEach((item: PurchaseOrderItem) => {
      initial[item.id] = {
        po_item_id: item.id,
        product_id: item.product_id,
        // Prefill with the outstanding balance, not the full ordered
        // quantity: on a follow-up receipt against a partially-received PO
        // the ordered figure is no longer what's still expected.
        quantity: outstandingBulkQuantity(item),
        lot_number: "",
        // Null by default since we don't know it
        expiry_date: "",
        current_selling_price: item.current_selling_price ?? null,
      };
    });
    setReceivedItems(initial);
    // po object identity changes on every refetch; key off the id instead
    // so we don't wipe in-progress edits while the underlying query revalidates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po?.id]);

  const handleFieldChange = React.useCallback(
    (
      itemId: string,
      field: keyof ReceivedItemPayload,
      value: string | number,
    ) => {
      setReceivedItems((prev) => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          [field]: value,
        },
      }));
    },
    [],
  );

  if (!po) return null;

  const handleConfirmClick = () => {
    if (isReceiving) return;
    const payload = Object.values(receivedItems);

    // Check if any items are missing an expiry date
    const missingExpiry = payload.find(
      (item) => item.quantity > 0 && !item.expiry_date,
    );
    if (missingExpiry) {
      setShowWarningModal(true);
      return;
    }

    onConfirm(po.id, payload);
  };

  const handleProceedWarning = () => {
    const payload = Object.values(receivedItems);
    setShowWarningModal(false);
    onConfirm(po.id, payload);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-border">
        <button
          type="button"
          aria-label="Close"
          className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          onClick={onBack}
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold text-foreground truncate">
            Receive Goods
          </h3>
          <p className="text-[13px] text-muted-foreground font-medium truncate">
            PO-{po.id.split("-")[0].toUpperCase()} · {po.vendor_name}
          </p>
        </div>
      </div>

      <ScrollFade containerClassName="flex-1" className="p-5">
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Confirm the quantities received and provide the batch/lot numbers
            and expiry dates for each item.
          </p>

          {mode === "standard" && (
            <div className="border rounded-lg divide-y">
              {(po.items?.length ?? 0) === 0 && (
                <EmptyState
                  icon={Package}
                  title="No items on this order"
                  className="py-8"
                />
              )}
              {po.items?.map((item: PurchaseOrderItem) => {
                const state = receivedItems[item.id] || {};
                return (
                  <ReceiveItemCard
                    key={item.id}
                    item={item}
                    state={state}
                    onFieldChange={handleFieldChange}
                  />
                );
              })}
            </div>
          )}

          {mode === "ledger" && (
            <ReceiveLedgerTable
              items={po.items || []}
              receivedItems={receivedItems}
              onFieldChange={handleFieldChange}
            />
          )}
        </div>
      </ScrollFade>

      <div className="p-5 border-t border-border bg-card mt-auto flex justify-end gap-3">
        <Button variant="outline" onClick={onBack} disabled={isReceiving}>
          Cancel
        </Button>
        <Button onClick={handleConfirmClick} disabled={isReceiving}>
          {isReceiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isReceiving ? "Receiving..." : "Confirm & Receive"}
        </Button>
      </div>

      <AlertDialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing Expiry Date</AlertDialogTitle>
            <AlertDialogDescription>
              Some items are missing an expiry date. They will be marked with a
              warning badge. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleProceedWarning}
              className="!bg-destructive !text-destructive-foreground !hover:bg-destructive/90"
            >
              Proceed Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

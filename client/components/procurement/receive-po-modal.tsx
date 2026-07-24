import React, { useState, useEffect } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerInput } from "@/components/ui/date-picker-input";
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
import { formatCurrency } from "@/lib/utils";

export interface ReceivedItemPayload {
  po_item_id: string;
  product_id: string;
  quantity: number;
  lot_number?: string;
  expiry_date?: string;
}

interface ReceivePOModalProps {
  po: PurchaseOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (poId: string, receivedItems: ReceivedItemPayload[]) => void;
}

const ReceiveItemCard = React.memo(
  ({
    item,
    state,
    onFieldChange,
  }: {
    item: PurchaseOrderItem;
    state: ReceivedItemPayload;
    onFieldChange: (
      itemId: string,
      field: keyof ReceivedItemPayload,
      value: any,
    ) => void;
  }) => {
    return (
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-semibold text-[15px]">{item.product_name}</h4>
            <p className="text-sm text-muted-foreground">
              Ordered: {item.bulk_quantity} units @{" "}
              {formatCurrency(item.unit_cost)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg">
          <div className="space-y-2">
            <Label className="text-xs">Qty Received</Label>
            <Input
              type="number"
              min="0"
              value={state.quantity ?? item.bulk_quantity}
              onChange={(e) =>
                onFieldChange(
                  item.id,
                  "quantity",
                  parseInt(e.target.value) || 0,
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Lot / Batch No. (Optional)</Label>
            <Input
              placeholder="e.g. BATCH-123"
              value={state.lot_number || ""}
              onChange={(e) =>
                onFieldChange(item.id, "lot_number", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Expiry Date (Optional)</Label>
            <DatePickerInput
              value={state.expiry_date}
              onChange={(val) => onFieldChange(item.id, "expiry_date", val)}
              placeholder="Select expiry date"
            />
          </div>
        </div>
      </div>
    );
  },
);
ReceiveItemCard.displayName = "ReceiveItemCard";

export function ReceivePOModal({
  po,
  isOpen,
  onClose,
  onConfirm,
}: ReceivePOModalProps) {
  const [receivedItems, setReceivedItems] = useState<
    Record<string, ReceivedItemPayload>
  >({});
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Initialize payload state when modal opens or PO changes
  useEffect(() => {
    if (isOpen && po) {
      const initial: Record<string, ReceivedItemPayload> = {};
      po.items?.forEach((item: PurchaseOrderItem) => {
        initial[item.id] = {
          po_item_id: item.id,
          product_id: item.product_id,
          // Prefill with expected bulk_quantity.
          quantity: item.bulk_quantity,
          lot_number: "",
          // Null by default since we don't know it
          expiry_date: "",
        };
      });
      setReceivedItems(initial);
    }
  }, [isOpen, po]);

  const handleFieldChange = React.useCallback(
    (itemId: string, field: keyof ReceivedItemPayload, value: any) => {
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
    onClose();
  };

  const handleProceedWarning = () => {
    const payload = Object.values(receivedItems);
    setShowWarningModal(false);
    onConfirm(po.id, payload);
    onClose();
  };

  return (
    <>
      <ResponsiveModal
        open={isOpen}
        onOpenChange={(open) => !open && onClose()}
        title={`Receive Goods: ${po.id}`}
        description="Please confirm the quantities received and provide the batch/lot numbers and expiry dates for each item."
        className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="space-y-6 flex-1 overflow-y-auto px-4 sm:px-0">
          <div className="border rounded-lg divide-y">
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
        </div>
        <div className="mt-6 flex justify-end gap-3 shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirmClick}>Confirm & Receive</Button>
        </div>
      </ResponsiveModal>

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
    </>
  );
}

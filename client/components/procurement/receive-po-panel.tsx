"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ReceiveLedgerTable } from "./receive-ledger-table";
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
import { useMediaQuery } from "@/hooks/use-media-query";

export interface ReceivedItemPayload {
  po_item_id: string;
  product_id: string;
  quantity: number;
  lot_number?: string;
  expiry_date?: string;
  cost_price?: string | number;
  selling_price?: string | number;
}

interface ReceivePOPanelProps {
  po: PurchaseOrder | null;
  onBack: () => void;
  onConfirm: (poId: string, receivedItems: ReceivedItemPayload[]) => void;
}

/** One-item-at-a-time cards — used on phones, where the ledger table's
 * columns would be too cramped to use even with horizontal scroll. */
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
      value: string | number,
    ) => void;
  }) => {
    return (
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-semibold text-[15px]">{item.product_name}</h4>
            <p className="text-sm text-muted-foreground">
              Ordered: {item.bulk_quantity} {item.bulk_unit}(s) @{" "}
              {formatCurrency(item.unit_cost)}/{item.bulk_unit}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg">
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              Qty Received (in {item.bulk_unit}s)
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 opacity-50 cursor-pointer" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Enter the number of {item.bulk_unit}s received, not base
                      units. This is automatically converted to{" "}
                      {(item.product_units_per_bulk || item.units_per_bulk) *
                        (Number(state.quantity ?? item.bulk_quantity) ||
                          0)}{" "}
                      base units in stock, using the product&apos;s current
                      packaging setting.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
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
              disablePast
              fromYear={new Date().getFullYear()}
              toYear={new Date().getFullYear() + 15}
            />
            <div className="text-[11px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-[10px] px-3 py-2 flex gap-1.5 items-start">
              <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                If the package only shows a month and year, pick the 1st of
                that month.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
ReceiveItemCard.displayName = "ReceiveItemCard";

/** Embedded, full-height replacement for the old Receive Goods modal — it
 * takes over the same side panel used for PO details so the ledger table
 * gets the panel's full width/height instead of being cramped inside a
 * centered dialog. */
export function ReceivePOPanel({ po, onBack, onConfirm }: ReceivePOPanelProps) {
  const [receivedItems, setReceivedItems] = useState<
    Record<string, ReceivedItemPayload>
  >({});
  const [showWarningModal, setShowWarningModal] = useState(false);
  // Ledger needs room for a dense multi-column table — tablet and up have
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
        // Prefill with expected bulk_quantity.
        quantity: item.bulk_quantity,
        lot_number: "",
        // Null by default since we don't know it
        expiry_date: "",
      };
    });
    setReceivedItems(initial);
    // po object identity changes on every refetch — key off the id instead
    // so we don't wipe in-progress edits while the underlying query revalidates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po?.id]);

  const handleFieldChange = React.useCallback(
    (itemId: string, field: keyof ReceivedItemPayload, value: string | number) => {
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
  };

  const handleProceedWarning = () => {
    const payload = Object.values(receivedItems);
    setShowWarningModal(false);
    onConfirm(po.id, payload);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-border">
        <div
          className="w-[38px] h-[38px] rounded-[10px] bg-muted flex items-center justify-center cursor-pointer text-muted-foreground shrink-0 hover:bg-muted/80 transition-colors"
          onClick={onBack}
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold text-foreground truncate">
            Receive Goods
          </h3>
          <p className="text-[13px] text-muted-foreground font-medium truncate">
            PO-{po.id.split("-")[0].toUpperCase()} · {po.vendor_name}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-4">
        <p className="text-[13px] text-muted-foreground">
          Confirm the quantities received and provide the batch/lot numbers
          and expiry dates for each item.
        </p>

        {mode === "standard" && (
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
        )}

        {mode === "ledger" && (
          <ReceiveLedgerTable
            items={po.items || []}
            receivedItems={receivedItems}
            onFieldChange={handleFieldChange}
          />
        )}
      </div>

      <div className="p-5 border-t border-border bg-card mt-auto flex justify-end gap-3">
        <Button variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={handleConfirmClick}>Confirm & Receive</Button>
      </div>

      <AlertDialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Missing Expiry Date</AlertDialogTitle>
            <AlertDialogDescription>
              Some items are missing an expiry date. They will be marked with
              a warning badge. Are you sure you want to proceed?
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

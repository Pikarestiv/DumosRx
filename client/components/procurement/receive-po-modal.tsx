import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import type { PurchaseOrder, PurchaseOrderItem } from "@/lib/db/local-database";
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

export function ReceivePOModal({ po, isOpen, onClose, onConfirm }: ReceivePOModalProps) {
  const [receivedItems, setReceivedItems] = useState<Record<string, ReceivedItemPayload>>({});

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

  if (!po) return null;

  const handleFieldChange = (itemId: string, field: keyof ReceivedItemPayload, value: any) => {
    setReceivedItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleConfirm = () => {
    const payload = Object.values(receivedItems);
    onConfirm(po.id, payload);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Receive Goods: {po.id}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <p className="text-sm text-muted-foreground">
            Please confirm the quantities received and provide the batch/lot numbers and expiry dates for each item.
          </p>

          <div className="border rounded-lg divide-y">
            {po.items?.map((item: PurchaseOrderItem) => {
              const state = receivedItems[item.id] || {};
              return (
                <div key={item.id} className="p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-[15px]">{item.product_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Ordered: {item.bulk_quantity} units @ {formatCurrency(item.unit_cost)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted/20 p-4 rounded-lg">
                    <div className="space-y-2">
                      <Label className="text-xs">Qty Received</Label>
                      <Input 
                        type="number" 
                        min="0"
                        value={state.quantity ?? item.bulk_quantity} 
                        onChange={(e) => handleFieldChange(item.id, "quantity", parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Lot / Batch No. (Optional)</Label>
                      <Input 
                        placeholder="e.g. BATCH-123" 
                        value={state.lot_number || ""}
                        onChange={(e) => handleFieldChange(item.id, "lot_number", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Expiry Date (Optional)</Label>
                      <DatePickerInput
                        value={state.expiry_date}
                        onChange={(val) => handleFieldChange(item.id, "expiry_date", val)}
                        placeholder="Select expiry date"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm & Receive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import type { CartItem } from "@/lib/hooks/use-pos-cart";
import type { Customer } from "@/lib/types/customer";
import { ReceiptView } from "./receipt-view";
import { usePrintReceipt } from "./use-print-receipt";
import { cartToReceiptTransaction } from "./cart-to-receipt-transaction";

interface ProformaPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  selectedCustomer?: Customer | null;
}

export function ProformaPreviewDialog({
  open,
  onOpenChange,
  cart,
  subtotal,
  tax,
  discount,
  total,
  selectedCustomer = null,
}: ProformaPreviewDialogProps) {
  const { user } = useAuth();
  const { print, portal, paperSize } = usePrintReceipt();
  const cashier = user?.first_name
    ? `${user.first_name} ${user.last_name || ""}`.trim()
    : user?.username || "Cashier";

  // Recomputed only when the dialog opens (not on every cart edit while it's
  // closed) - id/date are meaningless for a quote no one's committed to yet,
  // just a stable snapshot for this preview.
  const transaction = useMemo(() => {
    if (!open) return null;
    return cartToReceiptTransaction(
      cart,
      subtotal,
      tax,
      discount,
      total,
      selectedCustomer,
      cashier,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePrint = () => {
    if (transaction) print(transaction, "quote");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[450px] p-0 overflow-hidden">
        <DialogHeader className="p-6 bg-muted/50 border-b">
          <DialogTitle>Proforma Invoice</DialogTitle>
          <DialogDescription>
            Preview pricing for this shopping list - no sale is recorded and
            no stock is deducted until it's actually charged.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {transaction && (
            <ReceiptView
              transaction={transaction}
              paperSize={paperSize}
              documentType="quote"
            />
          )}
        </div>

        <div className="flex gap-3 p-6 bg-muted/50 border-t">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button className="flex-1" onClick={handlePrint}>
            <Receipt className="h-4 w-4 mr-2" />
            Print Quote
          </Button>
        </div>
      </DialogContent>
      {portal}
    </Dialog>
  );
}

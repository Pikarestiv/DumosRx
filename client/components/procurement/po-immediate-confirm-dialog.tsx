"use client";

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
import { countSellingPriceOverrides } from "./po-line-item-math";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";

interface POImmediateConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: POLineItemDraft[];
  products: POProduct[];
  totalAmount: number;
  onConfirm: () => void;
}

/** Last stop before createAndReceivePurchaseOrder, which adds stock AND
 * rewrites products.selling_price store-wide in the same action with no undo
 * path. Spells out what is about to change - item count, money, and how many
 * lines carry a real selling-price change - because the button that opens
 * this used to read "Save" and the only explanation anywhere was a hover
 * tooltip no touch user could reach. */
export function POImmediateConfirmDialog({
  open,
  onOpenChange,
  items,
  products,
  totalAmount,
  onConfirm,
}: POImmediateConfirmDialogProps) {
  const priceChangeCount = countSellingPriceOverrides(items, products);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Receive this purchase now?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {items.length} {items.length === 1 ? "item" : "items"} worth{" "}
                {formatCurrency(totalAmount)} will be added to your stock right
                away.
              </p>
              {priceChangeCount > 0 ? (
                <p>
                  This also changes the selling price of{" "}
                  {priceChangeCount === 1
                    ? "1 product"
                    : `${priceChangeCount} products`}{" "}
                  store-wide, everywhere they are sold.
                </p>
              ) : (
                <p>No selling price will change.</p>
              )}
              <p>This cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go Back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Receive Purchase
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

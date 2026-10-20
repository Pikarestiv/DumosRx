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
import {
  countSellingPriceOverrides,
  getTotalBaseUnits,
} from "./po-line-item-math";
import { formatCurrency } from "@/lib/utils";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";

interface POImmediateConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: POLineItemDraft[];
  products: POProduct[];
  totalAmount: number;
  onConfirm: () => void;
}

// Last stop before createAndReceivePurchaseOrder, which adds stock AND rewrites products.selling_price store-wide in the s…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-immediate-confirm-dialog-tsx-L31
export function POImmediateConfirmDialog({
  open,
  onOpenChange,
  items,
  products,
  totalAmount,
  onConfirm,
}: POImmediateConfirmDialogProps) {
  const displayName = useDisplayName();
  const priceChangeCount = countSellingPriceOverrides(items, products);
  const totalUnits = getTotalBaseUnits(items);
  const unitLabel = `${totalUnits} ${totalUnits === 1 ? "unit" : "units"}`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Receive this purchase now?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {items.length === 1
                  ? `${unitLabel} of ${displayName(items[0].product_name)}`
                  : `${unitLabel} across ${items.length} products`}
                , worth {formatCurrency(totalAmount)}, will be added to your
                stock right away.
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

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
import { AlertTriangle } from "lucide-react";
import {
  countSellingPriceOverrides,
  formatProductNamesList,
  getTotalBaseUnits,
  getZeroCostLineItems,
  getZeroSellingPriceLineItems,
  resolveReceiveButtonLabel,
} from "./po-line-item-math";
import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { OwedSettlementNotice } from "./owed-settlement-notice";

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
  const formatCurrency = useFormatCurrency();
  const displayName = useDisplayName();
  const priceChangeCount = countSellingPriceOverrides(items, products);
  const totalUnits = getTotalBaseUnits(items);
  const unitLabel = `${totalUnits} ${totalUnits === 1 ? "unit" : "units"}`;
  const zeroCostItems = getZeroCostLineItems(items);
  const zeroSellingPriceItems = getZeroSellingPriceLineItems(items, products);
  const hasZeroPriceWarning =
    zeroCostItems.length > 0 || zeroSellingPriceItems.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Receive this purchase now?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
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
              {hasZeroPriceWarning && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-950 dark:text-amber-100 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <p className="font-semibold text-[13px] leading-tight text-amber-950 dark:text-amber-100">
                        Price warning on items being received
                      </p>
                      {zeroCostItems.length > 0 && (
                        <div className="space-y-0.5">
                          <p className="font-semibold text-amber-900 dark:text-amber-200">
                            Zero Cost Price (₦0):{" "}
                            <span className="font-normal">
                              {formatProductNamesList(
                                zeroCostItems.map((item) =>
                                  displayName(item.product_name),
                                ),
                              )}
                            </span>
                          </p>
                          <p className="text-[11.5px] text-amber-800/90 dark:text-amber-300/90">
                            Stock will enter inventory at ₦0 cost, which will distort your inventory valuation and profit margins.
                          </p>
                        </div>
                      )}
                      {zeroSellingPriceItems.length > 0 && (
                        <div className="space-y-0.5">
                          <p className="font-semibold text-amber-900 dark:text-amber-200">
                            Zero Selling Price (₦0):{" "}
                            <span className="font-normal">
                              {formatProductNamesList(
                                zeroSellingPriceItems.map((item) =>
                                  displayName(item.product_name),
                                ),
                              )}
                            </span>
                          </p>
                          <p className="text-[11.5px] text-amber-800/90 dark:text-amber-300/90">
                            These products will be sold for free (₦0) at the register unless a selling price is set.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <OwedSettlementNotice
                lines={items.map((item) => ({
                  productId: item.product_id,
                  baseUnits: Number(item.bulk_quantity) * (Number(item.units_per_bulk) || 1),
                }))}
              />
              <p>This cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {hasZeroPriceWarning ? "Go Back & Edit Prices" : "Go Back"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              hasZeroPriceWarning
                ? "!bg-amber-600 hover:!bg-amber-700 !text-white dark:!bg-amber-600 dark:hover:!bg-amber-700 dark:!text-white"
                : undefined
            }
          >
            {resolveReceiveButtonLabel(
              zeroCostItems.length > 0,
              zeroSellingPriceItems.length > 0,
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

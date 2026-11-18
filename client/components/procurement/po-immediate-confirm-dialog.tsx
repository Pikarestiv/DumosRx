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
  formatProductNamesList,
  getImmediateUnitCost,
  getMarginCue,
  getTotalBaseUnits,
  getZeroCostLineItems,
  getZeroQuantityLineItems,
  getZeroSellingPriceLineItems,
  resolveReceiveButtonLabel,
} from "./po-line-item-math";
import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import type { POLineItemDraft } from "./po-item-ledger-table";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { OwedSettlementNotice } from "./owed-settlement-notice";

interface POImmediateConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: POLineItemDraft[];
  products: ConfirmProduct[];
  totalAmount: number;
  onConfirm: () => void;
  skippedItems?: POLineItemDraft[];
}

export interface ConfirmProduct {
  id: string;
  selling_price?: number | null;
  cost_price?: number | null;
}

function countMarginCues(items: POLineItemDraft[], products: ConfirmProduct[]) {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const counts = { below_cost: 0, thinner: 0 };
  for (const item of items) {
    if (!(Number(item.bulk_quantity) > 0)) continue;
    const product = productMap.get(item.product_id);
    const cue = getMarginCue({ unitCost: getImmediateUnitCost(item), sellingPrice: product?.selling_price, previousCost: product?.cost_price });
    if (cue) counts[cue] += 1;
  }
  return counts;
}

const productCount = (n: number) => (n === 1 ? "1 product" : `${n} products`);

// Last stop before stock is added, with no undo path.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-immediate-confirm-dialog-tsx-L31
export function POImmediateConfirmDialog({
  open,
  onOpenChange,
  items,
  products,
  totalAmount,
  onConfirm,
  skippedItems = [],
}: POImmediateConfirmDialogProps) {
  const formatCurrency = useFormatCurrency();
  const displayName = useDisplayName();
  const marginCues = countMarginCues(items, products);
  const totalUnits = getTotalBaseUnits(items);
  const unitLabel = `${totalUnits} ${totalUnits === 1 ? "unit" : "units"}`;
  const zeroCostItems = getZeroCostLineItems(items);
  const zeroSellingPriceItems = getZeroSellingPriceLineItems(items, products);
  const zeroQuantityItems = getZeroQuantityLineItems(items);
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
              <p>No selling price will change.</p>
              {(marginCues.below_cost > 0 || marginCues.thinner > 0) && (
                <p className="text-amber-700 dark:text-amber-300">
                  {[
                    marginCues.below_cost > 0 && `${productCount(marginCues.below_cost)} will sell at or below this cost`,
                    marginCues.thinner > 0 && `${productCount(marginCues.thinner)} will earn a thinner margin than before`,
                  ].filter(Boolean).join("; ")}
                  . Change a selling price from the product if you need to.
                </p>
              )}
              {skippedItems.length > 0 && (
                <p>
                  {formatProductNamesList(skippedItems.map((item) => displayName(item.product_name)))}{" "}
                  {skippedItems.length === 1 ? "has" : "have"} no quantity and will be left off this receipt.
                </p>
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
              {zeroQuantityItems.length > 0 && (
                <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs font-semibold text-amber-950 dark:text-amber-100">
                  No quantity entered for{" "}
                  {formatProductNamesList(
                    zeroQuantityItems.map((item) => displayName(item.product_name)),
                  )}
                  . Go back and enter what you received.
                </p>
              )}
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
            disabled={zeroQuantityItems.length > 0}
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

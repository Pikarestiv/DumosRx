"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProductName } from "@/components/ui/product-name";
import { formatCurrency } from "@/lib/utils";
import type { ReturnableItem } from "@/lib/hooks/use-process-return-mutation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemsToReturn: ReturnableItem[];
  totalRefund: number;
  commissionOwedBack: number;
  currencyCode?: string;
  onConfirm: () => Promise<void>;
}

export function ReturnConfirmDialog({
  open,
  onOpenChange,
  itemsToReturn,
  totalRefund,
  commissionOwedBack,
  currencyCode,
  onConfirm,
}: Props) {
  const totalDiscarded = itemsToReturn.reduce(
    (sum, item) => sum + (item.discardQuantity || 0),
    0,
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Confirm Return & Refund"
      confirmLabel="Yes, Process Return"
      description={
        <div className="space-y-3 mt-2 text-left">
          <p className="text-sm">
            You are about to process a return for the following item(s):
          </p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {itemsToReturn.map((item) => {
              const discard = item.discardQuantity || 0;
              const restock = item.returnQuantity - discard;
              return (
                <li key={item.id}>
                  <span className="font-medium">{item.returnQuantity}x</span>{" "}
                  <ProductName
                    name={item.product_name || ""}
                    className="inline-block max-w-full align-bottom"
                  />
                  <span className="text-muted-foreground ml-1">
                    (
                    {formatCurrency(
                      (item.unit_price || 0) * item.returnQuantity,
                      currencyCode,
                    )}
                    )
                  </span>
                  {discard > 0 && (
                    <div className="text-xs text-muted-foreground pl-1 mt-0.5">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {restock} restocked
                      </span>
                      <span className="mx-1">•</span>
                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                        {discard} discarded as loss ({item.discardReason || "Damaged"})
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="pt-2 border-t mt-2">
            <p className="font-medium text-destructive">
              Total Refund: {formatCurrency(totalRefund, currencyCode)}
            </p>
            {totalDiscarded > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Note: {totalDiscarded} damaged/compromised item(s) will be written off as inventory loss and will not re-enter saleable stock.
              </p>
            )}
            {commissionOwedBack > 0 && (
              <p className="text-sm text-amber-600 mt-1">
                The reseller was already paid commission on this sale;{" "}
                {formatCurrency(commissionOwedBack, currencyCode)} of it is owed back.
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            <strong>Consequences:</strong> Sound returned quantities will be
            restocked into inventory batches, discarded items will be written off as
            damage loss, and this sale will be updated in the transaction history.
            This action cannot be undone.
          </p>
        </div>
      }
      onConfirm={onConfirm}
    />
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { queryKeys } from "@/lib/query-keys";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { errorDescription } from "@/lib/utils/error-description";
import {
  getPurchaseOrderReceipts,
  voidPurchaseOrderReceipt,
  type PurchaseOrderReceipt,
  type ReceiptBlock,
} from "@/lib/db/procurement-void-receipt";

const BLOCK_TEXT = new Map<ReceiptBlock, string>([
  ["partly_sold", "Some of it has been sold or adjusted since, so it can't be voided. Use Adjust Stock instead."],
  ["settled_backorders", "It paid off units customers were owed, so it can't be voided."],
  ["already_voided", "Voided."],
]);

const VOIDABLE_STATUSES = new Set(["partially_received", "received"]);

export function POReceiptsSection({ orderId, status }: { orderId: string; status: string }) {
  const canVoid = useHasPermission(["receive_purchase_orders", "adjust_stock_counts"], "all");
  const displayName = useDisplayName();
  const [pending, setPending] = useState<PurchaseOrderReceipt | null>(null);
  const { data: receipts = [] } = useQuery({
    ...queryKeys.purchaseOrders.receipts(orderId),
    queryFn: () => getPurchaseOrderReceipts(orderId),
  });
  if (receipts.length === 0) return null;
  const allowVoid = canVoid && VOIDABLE_STATUSES.has(status);

  const confirm = async (receipt: PurchaseOrderReceipt) => {
    try {
      const outcome = await voidPurchaseOrderReceipt(orderId, receipt.batch_id);
      if (outcome === "voided") toast.success("Receipt voided and stock taken back out");
      else toast.info(BLOCK_TEXT.get(outcome as ReceiptBlock) ?? "This receipt can no longer be voided.");
    } catch (error) {
      toast.error("Couldn't void the receipt", { description: errorDescription(error) });
    }
  };

  return (
    <section>
      <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Receipts</h4>
      <ul className="flex flex-col gap-2">
        {receipts.map((receipt) => (
          <li key={receipt.batch_id} className="flex items-start justify-between gap-3 rounded-[10px] border border-border px-3 py-2.5">
            <div className="min-w-0 text-[13px]">
              <div className="font-semibold text-foreground">
                {displayName(receipt.product_name)} · {receipt.units} units
              </div>
              <div className="text-[12px] text-muted-foreground">
                {formatDateSafe(receipt.received_at, "dd/MM/yyyy HH:mm", "")}
                {receipt.batch_number ? ` · Lot ${receipt.batch_number}` : ""}
              </div>
              {receipt.blocked && <div className="text-[12px] text-muted-foreground mt-1">{BLOCK_TEXT.get(receipt.blocked)}</div>}
            </div>
            {allowVoid && !receipt.blocked && (
              <Button variant="outline" size="sm" onClick={() => setPending(receipt)}>
                Void receipt
              </Button>
            )}
          </li>
        ))}
      </ul>
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `${pending.units} units of ${displayName(pending.product_name)} come back out of stock, and the order line goes back to expecting them. The receipt stays in the history with a matching reversal. What you paid the vendor is not changed.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void confirm(pending)}>Void receipt</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

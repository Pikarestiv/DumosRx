"use client";

import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
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
import { closePurchaseOrderShort, getCloseShortPreview } from "@/lib/db/procurement-close";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";
import { errorDescription } from "@/lib/utils/error-description";

interface POCloseShortDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function POCloseShortDialog({ orderId, open, onOpenChange }: POCloseShortDialogProps) {
  const currency = useStore().storeProfile?.currency;
  const { data: preview } = useQuery({
    queryKey: ["purchase_order_close_short_preview", orderId],
    queryFn: () => getCloseShortPreview(orderId),
    enabled: open,
    gcTime: 0,
  });
  const close = async () => {
    try {
      const outcome = await closePurchaseOrderShort(orderId);
      if (outcome === "closed") toast.success("Order closed short");
      else toast.info("This order can no longer be closed short.");
    } catch (error) {
      toast.error("Couldn't close the order", { description: errorDescription(error) });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close this order short?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this when the vendor will not deliver the rest. Nothing more can be received against it,
            its total drops to what has arrived, and what you still owe is worked out from that. Stock
            already received is not touched.
          </AlertDialogDescription>
          {!!preview && preview.overpaidBy > 0 && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Overpaid by {formatCurrency(preview.overpaidBy, currency)}. You paid {formatCurrency(preview.amountPaid, currency)} and what
              arrived comes to {formatCurrency(preview.receivedTotal, currency)}. The order stays Paid; settle the difference with
              the vendor.
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it open</AlertDialogCancel>
          <AlertDialogAction onClick={() => void close()}>Close short</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

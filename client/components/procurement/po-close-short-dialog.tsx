"use client";

import { toast } from "sonner";
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
import { closePurchaseOrderShort } from "@/lib/db/procurement-close";
import { errorDescription } from "@/lib/utils/error-description";

interface POCloseShortDialogProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function POCloseShortDialog({ orderId, open, onOpenChange }: POCloseShortDialogProps) {
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
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it open</AlertDialogCancel>
          <AlertDialogAction onClick={() => void close()}>Close short</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

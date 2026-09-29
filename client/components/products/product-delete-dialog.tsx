import { useRef } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useDeleteProductMutation,
  useProductDeletionBlockers,
} from "@/lib/hooks/use-product-delete";

interface ProductDeleteDialogProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductDeleteDialog({
  target,
  onClose,
  onSuccess,
}: ProductDeleteDialogProps) {
  const deleteProduct = useDeleteProductMutation();
  // Keeps rendering the last real target while ConfirmDialog's exit
  // animation plays out after `target` is nulled on confirm/close.
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const displayTarget = target ?? lastTarget.current;

  const { blockers, isLoading } = useProductDeletionBlockers(target?.id ?? null);
  const blockedByStock = blockers.stockOnHand > 0;
  const blockedByOrders = blockers.openPurchaseOrders > 0;
  const isBlocked = blockedByStock || blockedByOrders;

  const confirmDeleteProduct = async () => {
    if (!target || isLoading) return;
    if (isBlocked) {
      onClose();
      return;
    }
    try {
      await deleteProduct.mutateAsync(target.id);
      toast.success("Product deleted");
      onSuccess();
    } catch (error) {
      console.error("Failed to delete product:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete product",
      );
    }
  };

  const blockedDescription = blockedByStock
    ? `${displayTarget?.name} still has ${blockers.stockOnHand} in stock. Clear the shelf or write the stock off with a stock audit first - deleting it now would leave those units counted in your stock value with no product to show for them.`
    : `${displayTarget?.name} is on ${blockers.openPurchaseOrders} open purchase order${blockers.openPurchaseOrders === 1 ? "" : "s"}. Receive or cancel ${blockers.openPurchaseOrders === 1 ? "it" : "them"} before deleting the product, or the delivery will have nowhere to book in.`;

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeleteProduct}
      title={isBlocked ? "Can't Delete Product" : "Delete Product"}
      description={
        isLoading
          ? "Checking whether anything still depends on this product..."
          : isBlocked
            ? blockedDescription
            : `Are you sure you want to delete ${displayTarget?.name}? It will be removed from the catalog and the till. Past sales and purchase orders stay on record. This can't be undone from here.`
      }
      confirmLabel={isBlocked ? "OK" : "Delete Product"}
      hideCancel={isBlocked}
      variant={isBlocked ? "default" : "destructive"}
    />
  );
}

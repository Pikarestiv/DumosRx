import { useRef } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteSupplierMutation } from "@/lib/hooks/use-supplier-mutations";

interface SupplierDeleteDialogProps {
  target: {
    id: string;
    name: string;
    debtAmount: number;
    totalOrders: number;
  } | null;
  formatCurrency: (amount: number) => string;
  onClose: () => void;
  onSuccess: () => void;
}

export function SupplierDeleteDialog({
  target,
  formatCurrency,
  onClose,
  onSuccess,
}: SupplierDeleteDialogProps) {
  const deleteSupplier = useDeleteSupplierMutation();
  // Keeps rendering the last real target while ConfirmDialog's exit
  // animation plays out after `target` is nulled on confirm/close.
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const displayTarget = target ?? lastTarget.current;

  const hasDebt = (displayTarget?.debtAmount || 0) > 0;
  const hasHistory = (displayTarget?.totalOrders || 0) > 0;

  const confirmDeleteSupplier = async () => {
    if (!target) return;
    if (hasDebt) {
      onClose();
      return;
    }
    try {
      await deleteSupplier.mutateAsync(target.id);
      toast.success("Supplier deleted");
      onSuccess();
    } catch (error) {
      console.error("Failed to delete supplier:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete supplier",
      );
    }
  };

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeleteSupplier}
      title={hasDebt ? "Can't Delete Supplier" : "Delete Supplier"}
      description={
        hasDebt
          ? `You still owe ${displayTarget?.name} ${formatCurrency(displayTarget?.debtAmount || 0)} across unpaid purchase orders. Settle or write off the balance before deleting them - deleting them anyway would erase what you owe from your reports while the orders stay on the books.`
          : `Are you sure you want to delete ${displayTarget?.name}? They will be removed from the supplier directory.${hasHistory ? " Their past purchase orders stay on record." : ""} If you only want to stop ordering from them, set them to Inactive under Edit Details instead. This can't be undone from here.`
      }
      confirmLabel={hasDebt ? "OK" : "Delete Supplier"}
      hideCancel={hasDebt}
      variant={hasDebt ? "default" : "destructive"}
    />
  );
}

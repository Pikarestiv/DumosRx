import { useRef } from "react";
import { toast } from "sonner";
import { useDeleteCustomerMutation } from "@/lib/hooks/use-customer-mutations";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/utils";

interface CustomerDeleteDialogProps {
  target: { id: string; name: string; outstandingBalance: number } | null;
  currencyCode: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CustomerDeleteDialog({
  target,
  currencyCode,
  onClose,
  onSuccess,
}: CustomerDeleteDialogProps) {
  const deleteCustomer = useDeleteCustomerMutation();
  // Keeps rendering the last real target while ConfirmDialog's exit
  // animation plays out after `target` is nulled on confirm/close.
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const displayTarget = target ?? lastTarget.current;

  const hasDebt = (displayTarget?.outstandingBalance || 0) > 0;

  const confirmDeleteCustomer = async () => {
    if (!target) return;
    if (hasDebt) {
      onClose();
      return;
    }
    try {
      await deleteCustomer.mutateAsync(target.id);
      toast.success("Customer deleted");
      onSuccess();
    } catch (error) {
      console.error("Failed to delete customer:", error);
      toast.error("Failed to delete customer");
    }
  };

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeleteCustomer}
      title={hasDebt ? "Can't Delete Customer" : "Delete Customer"}
      description={
        hasDebt
          ? `${displayTarget?.name} has an outstanding balance of ${formatCurrency(displayTarget?.outstandingBalance || 0, currencyCode)}. Settle or write off their balance before deleting - deleting them anyway would erase what they owe from your reports while the sale stays on the books.`
          : `Are you sure you want to delete ${displayTarget?.name}? They will be removed from the customer directory. Their past sales stay on record. This can't be undone from here.`
      }
      confirmLabel={hasDebt ? "OK" : "Delete Customer"}
      hideCancel={hasDebt}
      variant={hasDebt ? "default" : "destructive"}
    />
  );
}

import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteFleetStoreMutation } from "@/lib/hooks/use-fleet-mutations";

interface FleetDeleteDialogProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function FleetDeleteDialog({ target, onClose, onSuccess }: FleetDeleteDialogProps) {
  const deleteStoreMutation = useDeleteFleetStoreMutation();

  const confirmDeleteStore = async () => {
    if (!target) return;
    try {
      await deleteStoreMutation.mutateAsync(target.id);
      toast.success("Store removed successfully");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove store");
    } finally {
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeleteStore}
      title="Delete Store"
      description={`Are you sure you want to delete "${target?.name}"? This also deactivates all staff assigned to this store. This action cannot be undone.`}
      confirmLabel={deleteStoreMutation.isPending ? "Deleting..." : "Delete Store"}
      variant="destructive"
    />
  );
}

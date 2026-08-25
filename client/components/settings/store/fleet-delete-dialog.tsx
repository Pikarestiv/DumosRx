import { useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface FleetDeleteDialogProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function FleetDeleteDialog({ target, onClose, onSuccess }: FleetDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeleteStore = async () => {
    if (!target) return;
    setIsDeleting(true);
    try {
      await apiClient.deleteStore(target.id);
      toast.success("Store removed successfully");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove store");
    } finally {
      setIsDeleting(false);
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
      confirmLabel={isDeleting ? "Deleting..." : "Delete Store"}
      variant="destructive"
    />
  );
}

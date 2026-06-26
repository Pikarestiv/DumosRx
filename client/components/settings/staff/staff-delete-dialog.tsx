import { useState } from "react";
import { toast } from "sonner";
import { useMutateUser } from "@/lib/hooks/queries/use-users";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface StaffDeleteDialogProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function StaffDeleteDialog({
  target,
  onClose,
  onSuccess,
}: StaffDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { remove } = useMutateUser();

  const confirmDeleteUser = async () => {
    if (!target) return;
    setIsDeleting(true);
    try {
      await remove.mutateAsync(target.id);
      toast.success("Staff account deleted");
      onSuccess();
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error("Failed to delete staff account");
    } finally {
      setIsDeleting(false);
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeleteUser}
      title="Delete Staff Member"
      description={`Are you sure you want to delete the account for ${target?.name}? This action cannot be undone and will immediately revoke their access.`}
      confirmLabel={isDeleting ? "Deleting..." : "Delete Account"}
      variant="destructive"
    />
  );
}

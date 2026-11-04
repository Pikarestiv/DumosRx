import { useState } from "react";
import { toast } from "sonner";
import { useMutateUser } from "@/lib/hooks/queries/use-users";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface StaffDeleteDialogProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSuccess: (targetId: string, name: string) => void;
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
      onSuccess(target.id, target.name);
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
      title="Delete Staff Account"
      description={`Are you sure you want to delete the account for ${target?.name}? They will be removed from your staff roster and will no longer be able to log in. Past sales, receipts, and audit history will remain intact. You can recover this account at any time from Deleted Accounts.`}
      confirmLabel={isDeleting ? "Deleting..." : "Delete Account"}
      variant="destructive"
    />
  );
}

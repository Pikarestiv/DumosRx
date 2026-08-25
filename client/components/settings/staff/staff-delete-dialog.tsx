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
  const [isDeactivating, setIsDeactivating] = useState(false);
  const { update } = useMutateUser();

  const confirmDeactivateUser = async () => {
    if (!target) return;
    setIsDeactivating(true);
    try {
      await update.mutateAsync({ id: target.id, data: { is_active: 0 } });
      toast.success("Staff account deactivated");
      onSuccess();
    } catch (error) {
      console.error("Failed to deactivate user:", error);
      toast.error("Failed to deactivate staff account");
    } finally {
      setIsDeactivating(false);
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={confirmDeactivateUser}
      title="Deactivate Staff Account"
      description={`Are you sure you want to deactivate the account for ${target?.name}? They will no longer be able to log in, but the account can be reactivated later.`}
      confirmLabel={isDeactivating ? "Deactivating..." : "Deactivate Account"}
      variant="destructive"
    />
  );
}

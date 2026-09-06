import { Ban } from "lucide-react";
import { toast } from "sonner";
import { BaseDialogProps } from "./dialog-types";
import { UserActionConfirmDialog } from "./user-action-confirm-dialog";
import type { useDeactivateUserMutation } from "@/lib/api/admin-hooks";

export function DeactivateUserDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  deactivateMutation,
}: BaseDialogProps & { deactivateMutation: ReturnType<typeof useDeactivateUserMutation> }) {
  const handleDeactivate = () => {
    if (!selectedUser) return;
    deactivateMutation.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success("Account Deactivated", {
          description: `${selectedUser.name}'s account has been disabled.`,
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to deactivate user",
        });
      },
    });
  };

  return (
    <UserActionConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={Ban}
      tone="rose"
      title="Deactivate User Account?"
      description={
        <>
          Are you sure you want to deactivate{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {selectedUser?.name}
          </span>
          ? They will be immediately logged out and unable to access the
          platform until reactivated.
        </>
      }
      confirmLabel="Deactivate Account"
      isPending={deactivateMutation.isPending}
      onConfirm={handleDeactivate}
    />
  );
}

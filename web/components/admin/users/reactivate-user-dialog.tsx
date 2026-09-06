import { Shield } from "lucide-react";
import { toast } from "sonner";
import { BaseDialogProps } from "./dialog-types";
import { UserActionConfirmDialog } from "./user-action-confirm-dialog";
import type { useReactivateUserMutation } from "@/lib/api/admin-hooks";

export function ReactivateUserDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  reactivateMutation,
}: BaseDialogProps & { reactivateMutation: ReturnType<typeof useReactivateUserMutation> }) {
  const handleReactivate = () => {
    if (!selectedUser) return;
    reactivateMutation.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success("Account Reactivated", {
          description: `${selectedUser.name}'s account has been restored.`,
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to reactivate user",
        });
      },
    });
  };

  return (
    <UserActionConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={Shield}
      tone="emerald"
      title="Reactivate User Account?"
      description={
        <>
          Are you sure you want to reactivate{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {selectedUser?.name}
          </span>
          ? They will regain full access to their dashboard and store
          operations.
        </>
      }
      confirmLabel="Reactivate Account"
      isPending={reactivateMutation.isPending}
      onConfirm={handleReactivate}
    />
  );
}

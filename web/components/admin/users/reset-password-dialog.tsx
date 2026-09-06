import { Lock } from "lucide-react";
import { toast } from "sonner";
import { BaseDialogProps } from "./dialog-types";
import { UserActionConfirmDialog } from "./user-action-confirm-dialog";
import type { useResetUserPasswordMutation } from "@/lib/api/admin-hooks";

export function ResetPasswordDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  resetPasswordMutation,
}: BaseDialogProps & { resetPasswordMutation: ReturnType<typeof useResetUserPasswordMutation> }) {
  const handlePasswordReset = () => {
    if (!selectedUser) return;
    resetPasswordMutation.mutate(selectedUser.id, {
      onSuccess: (res) => {
        toast.success("Password Reset Forced", {
          description: `Temporary password: ${res.temp_password}. Please communicate this to the user.`,
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to force password reset",
        });
      },
    });
  };

  return (
    <UserActionConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={Lock}
      tone="amber"
      title="Force Password Reset?"
      description={
        <>
          This will invalidate{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {selectedUser?.name}
          </span>
          &apos;s current password and send a secure reset link to{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {selectedUser?.email}
          </span>
          .
        </>
      }
      confirmLabel="Confirm Reset"
      isPending={resetPasswordMutation.isPending}
      onConfirm={handlePasswordReset}
    />
  );
}

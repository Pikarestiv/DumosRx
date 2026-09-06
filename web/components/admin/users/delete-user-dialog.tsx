import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BaseDialogProps } from "./dialog-types";
import { UserActionConfirmDialog } from "./user-action-confirm-dialog";
import type { useDeleteUserMutation } from "@/lib/api/admin-hooks";

export function DeleteUserDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  deleteMutation,
}: BaseDialogProps & { deleteMutation: ReturnType<typeof useDeleteUserMutation> }) {
  const handleDelete = () => {
    if (!selectedUser) return;
    deleteMutation.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success("Account Deleted", {
          description: `${selectedUser.name}'s account and all associated data have been permanently deleted.`,
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err) => {
        toast.error("Deletion Failed", {
          description: err.message || "Failed to delete user",
        });
      },
    });
  };

  return (
    <UserActionConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={Trash2}
      tone="red"
      title="Permanently Delete User?"
      description={
        <>
          Are you sure you want to permanently delete{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {selectedUser?.name}
          </span>
          ? This action is irreversible and will erase all their associated
          data, including stores, sales, and products.
        </>
      }
      confirmLabel="Yes, Permanently Delete"
      isPending={deleteMutation.isPending}
      onConfirm={handleDelete}
    />
  );
}

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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
  // This dialog is one row-menu click away and erases the user's stores,
  // sales and products irreversibly, so a generic confirm button isn't enough:
  // the admin has to type the account's email back before it unlocks.
  const [confirmEmail, setConfirmEmail] = useState("");
  const emailMatches =
    !!selectedUser?.email &&
    confirmEmail.trim().toLowerCase() === selectedUser.email.trim().toLowerCase();

  const close = () => {
    setConfirmEmail("");
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!selectedUser || !emailMatches) return;
    deleteMutation.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success("Account Deleted", {
          description: `${selectedUser.name}'s account and all associated data have been permanently deleted.`,
        });
        close();
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
      onOpenChange={(open) => {
        if (open) {
          onOpenChange(true);
        } else {
          close();
        }
      }}
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
      confirmDisabled={!emailMatches}
      onConfirm={handleDelete}
    >
      <div className="space-y-2 pt-2">
        <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
          Type{" "}
          <span className="text-red-600 dark:text-red-500 normal-case tracking-normal">
            {selectedUser?.email}
          </span>{" "}
          to confirm
        </label>
        <Input
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          placeholder={selectedUser?.email || ""}
          autoComplete="off"
          className="rounded-xl border-2 font-bold h-12 focus-visible:ring-red-500"
        />
      </div>
    </UserActionConfirmDialog>
  );
}

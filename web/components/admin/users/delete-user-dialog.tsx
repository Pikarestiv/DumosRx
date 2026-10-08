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
        toast.success("Account Deactivated", {
          description: `${selectedUser.name}'s account was deactivated and their stores archived.`,
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
      title="Delete User Account?"
      description={
        <>
          Deactivates{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {selectedUser?.name}
          </span>{" "}
          and archives the stores they own, signing them out so those stores
          stop syncing. The account and its data are retained and can be
          restored — this does not free the email address. To remove a store
          and its data for good, use Delete Forever on the store itself.
        </>
      }
      confirmLabel="Yes, Delete Account"
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
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="rounded-xl border-2 font-bold h-12 focus-visible:ring-red-500"
        />
      </div>
    </UserActionConfirmDialog>
  );
}

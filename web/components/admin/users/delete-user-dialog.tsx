import { useState } from "react";
import {
  Send,
  Shield,
  Lock,
  Store,
  Ban,
  Loader2,
  Calendar,
  Activity,
  History,
  Briefcase,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BaseDialogProps } from "./dialog-types";

export function DeleteUserDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  deleteMutation,
}: BaseDialogProps & { deleteMutation: any }) {
  const handleDelete = async () => {
    if (!selectedUser) return;
    deleteMutation.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success("Account Deleted", {
          description: `${selectedUser.name}'s account and all associated data have been permanently deleted.`
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err: any) => {
        toast.error("Deletion Failed", { description: err.message || "Failed to delete user" });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-red-200 dark:border-red-900 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3 text-red-600 dark:text-red-500">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            Permanently Delete User?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            Are you sure you want to permanently delete <span className="font-bold text-slate-900 dark:text-white">{selectedUser?.name}</span>?
            This action is irreversible and will erase all their associated data, including stores, sales, and products.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border-2 font-bold h-12">Cancel</Button>
          <Button
            onClick={handleDelete}
            className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold h-12 shadow-lg shadow-red-600/20"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Yes, Permanently Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

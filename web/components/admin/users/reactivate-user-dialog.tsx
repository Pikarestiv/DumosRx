import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { useReactivateUserMutation } from "@/lib/api/admin-hooks";

export function ReactivateUserDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  reactivateMutation,
}: BaseDialogProps & { reactivateMutation: ReturnType<typeof useReactivateUserMutation> }) {
  const handleReactivate = async () => {
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-emerald-500" />
            </div>
            Reactivate User Account?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            Are you sure you want to reactivate{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {selectedUser?.name}
            </span>
            ? They will regain full access to their dashboard and store
            operations.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-2 font-bold h-12"
          >
            Cancel
          </Button>
          <Button
            onClick={handleReactivate}
            className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-12 shadow-lg shadow-emerald-500/20"
            disabled={reactivateMutation.isPending}
          >
            {reactivateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Reactivate Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

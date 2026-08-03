import { Ban, Loader2 } from "lucide-react";
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
import type { useDeactivateUserMutation } from "@/lib/api/admin-hooks";

export function DeactivateUserDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  deactivateMutation,
}: BaseDialogProps & { deactivateMutation: ReturnType<typeof useDeactivateUserMutation> }) {
  const handleDeactivate = async () => {
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <Ban className="h-5 w-5 text-rose-500" />
            </div>
            Deactivate User Account?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            Are you sure you want to deactivate{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {selectedUser?.name}
            </span>
            ? They will be immediately logged out and unable to access the
            platform until reactivated.
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
            onClick={handleDeactivate}
            className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold h-12 shadow-lg shadow-rose-500/20"
            disabled={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Deactivate Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

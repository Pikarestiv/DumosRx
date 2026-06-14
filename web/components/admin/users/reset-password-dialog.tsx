import { Lock, Loader2 } from "lucide-react";
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

export function ResetPasswordDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  resetPasswordMutation,
}: BaseDialogProps & { resetPasswordMutation: any }) {
  const handlePasswordReset = async () => {
    if (!selectedUser) return;
    resetPasswordMutation.mutate(selectedUser.id, {
      onSuccess: (res: any) => {
        toast.success("Password Reset Forced", {
          description: `Temporary password: ${res.temp_password}. Please communicate this to the user.`,
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err: any) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to force password reset",
        });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-amber-500" />
            </div>
            Force Password Reset?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            This will invalidate{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {selectedUser?.name}
            </span>
            's current password and send a secure reset link to{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {selectedUser?.email}
            </span>
            .
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
            onClick={handlePasswordReset}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold h-12 shadow-lg shadow-amber-500/20"
            disabled={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Confirm Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

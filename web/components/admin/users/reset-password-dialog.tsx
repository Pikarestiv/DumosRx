import { useState } from "react";
import { Lock, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  // The endpoint returns a generated temporary password, and this dialog is
  // the only place it is ever shown - so it stays on screen until the admin
  // closes it rather than living in a toast that auto-dismisses.
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePasswordReset = () => {
    if (!selectedUser) return;
    resetPasswordMutation.mutate(selectedUser.id, {
      onSuccess: (res) => {
        setTempPassword(res.temp_password);
        setCopied(false);
      },
      onError: (err) => {
        toast.error("Action Failed", {
          description: err.message || "Failed to force password reset",
        });
      },
    });
  };

  const handleCopy = () => {
    if (!tempPassword) return;
    void navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    setTempPassword(null);
    setCopied(false);
    onOpenChange(false);
    setSelectedUser(null);
  };

  if (tempPassword) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleDone();
        }}
      >
        <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Lock className="h-5 w-5 text-amber-500" />
              </div>
              Temporary Password Generated
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
              {selectedUser?.name}&apos;s old password no longer works. Copy the
              temporary password below and pass it to them over a channel you
              trust - it is shown once and cannot be retrieved after this dialog
              is closed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 flex items-center gap-2">
            <Input
              readOnly
              value={tempPassword}
              onFocus={(e) => e.currentTarget.select()}
              className="rounded-xl border-2 font-mono font-bold h-12"
            />
            <Button
              onClick={handleCopy}
              variant="outline"
              className="rounded-xl border-2 font-bold h-12 shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 mr-2 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <Button
              onClick={handleDone}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold h-12 shadow-lg shadow-amber-500/20"
            >
              I&apos;ve Saved It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
          &apos;s current password and generate a temporary one for{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {selectedUser?.email}
          </span>
          . No email is sent - the temporary password is shown here once, and
          you must pass it on to them yourself.
        </>
      }
      confirmLabel="Confirm Reset"
      isPending={resetPasswordMutation.isPending}
      onConfirm={handlePasswordReset}
    />
  );
}

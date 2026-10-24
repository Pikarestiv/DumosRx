import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { AdminFormValues } from "@/lib/admin/platform-admin-schema";

interface ConfirmSuperAdminDialogProps {
  pendingSuperAdmin: AdminFormValues | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (values: AdminFormValues) => void;
}

export function ConfirmSuperAdminDialog({
  pendingSuperAdmin,
  loading,
  onCancel,
  onConfirm,
}: ConfirmSuperAdminDialogProps) {
  return (
  <Dialog
    open={!!pendingSuperAdmin}
    onOpenChange={(open) => {
      if (!open && !loading) onCancel();
    }}
  >
    <DialogContent className="rounded-3xl border-red-200 dark:border-red-900 shadow-2xl">
      <DialogHeader>
        <DialogTitle className="text-2xl font-black flex items-center gap-3 text-red-600 dark:text-red-500">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-red-600" />
          </div>
          Create a Super Admin?
        </DialogTitle>
        <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
          This grants{" "}
          <span className="font-bold text-slate-900 dark:text-white">
            {pendingSuperAdmin?.first_name} {pendingSuperAdmin?.last_name} (
            {pendingSuperAdmin?.email})
          </span>{" "}
          full platform access, including impersonating any store on the
          platform and managing every other platform account. Only continue
          if that is genuinely intended.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2 pt-4">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border-2 font-bold h-12"
        >
          Cancel
        </Button>
        <Button
          onClick={() => pendingSuperAdmin && onConfirm(pendingSuperAdmin)}
          disabled={loading}
          className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold h-12 shadow-lg shadow-red-600/20"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Yes, Create Super Admin
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
}

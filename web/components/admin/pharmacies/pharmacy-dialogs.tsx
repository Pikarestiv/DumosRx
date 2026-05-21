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

interface SuspendPharmacyDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPharmacy: any;
  handleSuspend: () => void;
  isPending: boolean;
}

export function SuspendPharmacyDialog({
  isOpen,
  onOpenChange,
  selectedPharmacy,
  handleSuspend,
  isPending,
}: SuspendPharmacyDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <Ban className="h-5 w-5 text-rose-500" />
            </div>
            Suspend Pharmacy Account?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            Are you sure you want to suspend <span className="font-bold text-slate-900 dark:text-white">{selectedPharmacy?.name}</span>? 
            The pharmacy will lose access to all platform features and their fleet management will be frozen.
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
            onClick={handleSuspend}
            className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold h-12 shadow-lg shadow-rose-500/20"
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm Suspension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Ban, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface SuspendStoreDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStore: any;
  handleSuspend: (reason: string) => void;
  isPending: boolean;
}

export function SuspendStoreDialog({
  isOpen,
  onOpenChange,
  selectedStore,
  handleSuspend,
  isPending,
}: SuspendStoreDialogProps) {
  const [reason, setReason] = useState("");

  // Reset reason when dialog is opened/closed
  useEffect(() => {
    if (!isOpen) {
      setReason("");
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <Ban className="h-5 w-5 text-rose-500" />
            </div>
            Suspend Store Account?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            Are you sure you want to suspend <span className="font-bold text-slate-900 dark:text-white">{selectedStore?.name}</span>? 
            The store will lose access to all platform features and their database sync will be locked.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-2 py-4">
          <Label htmlFor="suspension-reason" className="font-bold text-sm">Suspension Reason (Visible to user)</Label>
          <Textarea
            id="suspension-reason"
            placeholder="e.g. Your store account has been suspended for violating our terms of usage. Please contact administrative support."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[100px] rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-rose-500"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-2 font-bold h-12"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => handleSuspend(reason)}
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

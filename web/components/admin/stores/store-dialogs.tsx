import { Ban, Loader2, Receipt } from "lucide-react";
import { useState } from "react";
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
import { useAdminStoreBillingHistory } from "@/lib/api/admin-hooks-stores";
import type { AdminStoreSummary } from "@/lib/types/admin";

interface SuspendStoreDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStore: AdminStoreSummary | null;
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
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Reset reason when dialog is opened/closed
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setReason("");
    }
  }

  const hasReason = reason.trim().length > 0;

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
            aria-invalid={!hasReason}
            className="min-h-[100px] rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-rose-500"
          />
          {/* The reason is shown to the store owner as the explanation for
              being locked out, so an empty one is never acceptable. */}
          {!hasReason && (
            <p className="text-xs font-medium text-rose-500">
              A reason is required - the store owner sees this text.
            </p>
          )}
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
            onClick={() => handleSuspend(reason.trim())}
            className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold h-12 shadow-lg shadow-rose-500/20"
            disabled={isPending || !hasReason}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm Suspension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BillingHistoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStore: AdminStoreSummary | null;
}

// Replaces the old `handleViewBilling` toast stub, which called no API at
// all. Backed by the new admin-scoped `GET admin/stores/{id}/billing-history`
// endpoint (AdminController::billingHistory) — the store-owner-self-service
// `subscription/billing-history` endpoint can't be reused here since it's
// scoped to the currently-authenticated user, not an arbitrary store.
export function BillingHistoryDialog({
  isOpen,
  onOpenChange,
  selectedStore,
}: BillingHistoryDialogProps) {
  const { data, isLoading, isError } = useAdminStoreBillingHistory(
    isOpen ? (selectedStore?.id ?? null) : null,
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-indigo-500" />
            </div>
            Billing History
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            Payment transactions for{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {selectedStore?.name}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 max-h-[60vh] overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          )}

          {isError && (
            <p className="text-sm text-rose-500 font-medium py-6 text-center">
              Failed to load billing history. Please try again.
            </p>
          )}

          {!isLoading && !isError && data && data.transactions.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium py-6 text-center">
              No billing transactions found for this store.
            </p>
          )}

          {!isLoading && !isError && data && data.transactions.length > 0 && (
            <div className="space-y-2">
              {data.transactions.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-4"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">{txn.desc}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {txn.date}
                      {txn.reference ? ` · Ref: ${txn.reference}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black">{txn.amount}</p>
                    <p
                      className={`text-xs font-bold ${
                        txn.status.toLowerCase() === "success"
                          ? "text-emerald-500"
                          : txn.status.toLowerCase() === "failed"
                            ? "text-rose-500"
                            : "text-amber-500"
                      }`}
                    >
                      {txn.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="rounded-xl font-bold h-12 w-full">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

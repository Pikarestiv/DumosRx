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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAccountManagerCandidates,
  useUpdateAccountManagerMutation,
} from "@/lib/api/admin-hooks-stores";
import { toast } from "sonner";
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

interface ViewStoreDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStore: AdminStoreSummary | null;
}

const UNASSIGNED = "__unassigned__";

export function ViewStoreDialog({
  isOpen,
  onOpenChange,
  selectedStore,
}: ViewStoreDialogProps) {
  const { data: candidatesData } = useAccountManagerCandidates();
  const updateAccountManager = useUpdateAccountManagerMutation();
  const [managerId, setManagerId] = useState<string>(UNASSIGNED);

  useEffect(() => {
    setManagerId(
      selectedStore?.account_manager_is_explicit && selectedStore.account_manager
        ? selectedStore.account_manager.id
        : UNASSIGNED,
    );
  }, [selectedStore]);

  if (!selectedStore) return null;

  const candidates = candidatesData?.data ?? [];

  const handleSaveManager = () => {
    updateAccountManager.mutate(
      {
        storeId: selectedStore.id,
        accountManagerId: managerId === UNASSIGNED ? null : managerId,
      },
      {
        onSuccess: () =>
          toast.success("Contact specialist updated", {
            description: `${selectedStore.name}'s account manager was reassigned.`,
          }),
        onError: () =>
          toast.error("Failed to update the contact specialist. Please try again."),
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Store Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Store Name</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">{selectedStore.name}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Store ID</p>
              <p className="font-mono text-sm">{selectedStore.id}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Owner</p>
              <p className="font-bold">{selectedStore.owner}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Email</p>
              <p className="font-medium">{selectedStore.email}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Subscription</p>
              <p className="font-medium text-indigo-600 capitalize">{selectedStore.plan}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Status</p>
              <p className="font-medium">{selectedStore.status}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Fleet Size</p>
              <p className="font-medium">{selectedStore.stores} locations</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Total Revenue</p>
              <p className="font-black">{selectedStore.revenue}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Created At</p>
              <p className="font-medium">{selectedStore.date}</p>
            </div>
          </div>

          {/* min-w-0: DialogContent is a CSS grid, whose items default to
              min-width:auto - without this, the Select's unbreakable long
              candidate text (whitespace-nowrap) forces the grid track (and
              so the whole dialog) to blow out past its own max-width. */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2 min-w-0">
            <Label className="text-xs font-bold uppercase text-slate-500">
              Contact Specialist / Account Manager
            </Label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {selectedStore.account_manager_is_explicit
                ? "Explicitly assigned."
                : selectedStore.account_manager
                  ? `Currently "${selectedStore.account_manager.name}" via referral/default, not explicitly assigned.`
                  : "No contact specialist resolved."}
            </p>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger className="rounded-xl w-full">
                {/* Explicit children, not Radix's default auto-rendered
                    item text: the full "Name (role) - email - phone" label
                    is unbreakable (whitespace-nowrap) and long enough to
                    blow out the dialog's width even with truncation
                    classes, since SelectTrigger/SelectValue are flex-based
                    and default to min-width:auto. A short name-only label
                    here sidesteps that entirely; full detail stays in the
                    dropdown list below, which has room to wrap. */}
                <SelectValue placeholder="Use referral/default">
                  {managerId === UNASSIGNED
                    ? "Use referral/default"
                    : candidates.find((c) => c.id === managerId)?.name ??
                      "Use referral/default"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Use referral/default</SelectItem>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.role}) - {c.email}
                    {c.phone ? ` - ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl font-bold"
              onClick={handleSaveManager}
              disabled={updateAccountManager.isPending}
            >
              {updateAccountManager.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Assignment
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="rounded-xl font-bold h-12 w-full">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

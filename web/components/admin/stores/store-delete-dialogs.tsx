import { Archive, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { STORE_PURGE_CONFIRMATION } from "@/lib/api/admin-hooks-stores";
import type { AdminStoreSummary } from "@/lib/types/admin";

interface ArchiveStoreDialogProps {
  store: AdminStoreSummary | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}

export function ArchiveStoreDialog({
  store,
  onOpenChange,
  onConfirm,
  isPending,
}: ArchiveStoreDialogProps) {
  const [reason, setReason] = useState("");
  const [prevStoreId, setPrevStoreId] = useState(store?.id ?? null);

  if ((store?.id ?? null) !== prevStoreId) {
    setPrevStoreId(store?.id ?? null);
    setReason("");
  }

  return (
    <Dialog open={store !== null} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
              <Archive className="h-5 w-5 text-slate-500" />
            </div>
            Archive this store?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            <span className="font-bold text-slate-900 dark:text-white">{store?.name}</span>
            drops out of the fleet list and every other listing, and its owner and staff are
            signed out so it stops syncing. No data is deleted &mdash; you can restore it at any
            time from the archived view, and they simply log in again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4">
          <Label htmlFor="archive-reason" className="font-bold text-sm">
            Reason (internal note, optional)
          </Label>
          <Textarea
            id="archive-reason"
            placeholder="e.g. Duplicate of the Ikeja branch account."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[80px] rounded-xl border-slate-200 dark:border-slate-800"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="font-bold rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="font-bold rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            disabled={isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Archive Store
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PurgeStoreDialogProps {
  store: AdminStoreSummary | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (confirmation: string) => void;
  isPending: boolean;
}

export function PurgeStoreDialog({
  store,
  onOpenChange,
  onConfirm,
  isPending,
}: PurgeStoreDialogProps) {
  const [typed, setTyped] = useState("");
  const [prevStoreId, setPrevStoreId] = useState(store?.id ?? null);

  if ((store?.id ?? null) !== prevStoreId) {
    setPrevStoreId(store?.id ?? null);
    setTyped("");
  }

  const canSubmit = typed === STORE_PURGE_CONFIRMATION && !isPending;

  return (
    <Dialog open={store !== null} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-rose-600" />
            </div>
            Permanently delete this store?
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            This erases <span className="font-bold text-slate-900 dark:text-white">{store?.name}</span>{" "}
            and everything scoped to it — products, sales, stock records, customers and its staff
            accounts. It cannot be undone and there is no backup. Archive it instead if you only
            want it out of the way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4">
          <Label htmlFor="purge-confirmation" className="font-bold text-sm">
            Type <span className="font-mono text-rose-600">{STORE_PURGE_CONFIRMATION}</span> to
            confirm
          </Label>
          <Input
            id="purge-confirmation"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={STORE_PURGE_CONFIRMATION}
            className="rounded-xl border-slate-200 dark:border-slate-800 focus-visible:ring-rose-500 font-mono"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="font-bold rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="font-bold rounded-xl bg-rose-600 hover:bg-rose-700"
            disabled={!canSubmit}
            onClick={() => onConfirm(typed)}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete Forever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

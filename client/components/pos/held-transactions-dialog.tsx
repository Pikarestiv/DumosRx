"use client";

import { useEffect, useRef, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PlayCircle,
  Trash2,
  Clock,
  User,
  ShoppingBag,
  PauseCircle,
  Loader2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useHeldTransactions, useDeleteHeldTransactionMutation } from "@/lib/hooks/use-sales-data";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";

import type { HeldTransaction } from "@/lib/db/queries/sales";

/** items_json is read straight from a local DB row, so a corrupted or
 * truncated value must not throw in the render path — one bad row would
 * take the whole dialog down instead of just showing 0 items for itself. */
function getItemCount(itemsJson: string): number {
  try {
    return JSON.parse(itemsJson).length;
  } catch {
    return 0;
  }
}

interface HeldTransactionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRecall: (transaction: HeldTransaction) => void;
}

export function HeldTransactionsDialog({
  isOpen,
  onClose,
  onRecall,
}: HeldTransactionsDialogProps) {
  const {
    heldItems,
    loading,
    refetch: loadHeldTransactions,
  } = useHeldTransactions();
  const { storeProfile } = useStore();
  const deleteMutation = useDeleteHeldTransactionMutation();
  // Only one delete is ever in flight per dialog instance, so the pending
  // mutation's own variables (the id it was called with) double as the
  // "which row is busy" flag — no separate local state needed.
  const deletingId = deleteMutation.isPending ? deleteMutation.variables : null;

  useEffect(() => {
    if (isOpen) {
      void loadHeldTransactions();
    }
  }, [isOpen, loadHeldTransactions]);

  // Discarding a held sale is irreversible, so the trash icon only opens a
  // confirmation; the mutation runs from the dialog's confirm action.
  const [deleteTarget, setDeleteTarget] = useState<HeldTransaction | null>(null);
  // Keeps the name rendered while ConfirmDialog's exit animation plays out
  // after the target is cleared (same pattern as CustomerDeleteDialog).
  const lastDeleteTarget = useRef<HeldTransaction | null>(null);
  if (deleteTarget) lastDeleteTarget.current = deleteTarget;
  const deleteTargetName =
    (deleteTarget ?? lastDeleteTarget.current)?.customer_name ||
    "Walk-in Customer";

  const handleDelete = (id: string) => {
    if (deleteMutation.isPending) return;
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Held transaction discarded"),
      onError: (err) => {
        console.error(err);
        toast.error("Failed to delete transaction");
      },
    });
  };

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={onClose}
      title={
        <span className="flex items-center gap-2">
          <PauseCircle className="h-5 w-5 text-amber-500" />
          Held Transactions
        </span>
      }
      description="Recall transactions that were previously paused."
      className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
      footer={
        <DialogFooter className="border-t border-accent/10 pt-6">
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      }
    >
      <div className="py-4 min-h-[300px] max-h-[500px] overflow-y-auto space-y-4">
        {loading && (
          <div className="py-20 text-center text-muted-foreground animate-pulse">
            Loading held sales...
          </div>
        )}
        {!loading && heldItems.length === 0 && (
          <EmptyState
            icon={ShoppingBag}
            title="No held transactions found"
            className="py-20"
          />
        )}
        {!loading &&
          heldItems.length > 0 &&
          heldItems.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-accent/10 bg-card/50 hover:bg-accent/5 transition-all gap-3 sm:gap-4"
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 rounded-full bg-muted flex items-center justify-center border border-accent/5">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                </div>
                <div className="space-y-1 sm:space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold truncate text-sm sm:text-base">
                      {item.customer_name || "Walk-in Customer"}
                    </p>
                    <Badge
                      variant="outline"
                      className="text-[9px] sm:text-[10px] h-4 bg-amber-500/5 text-amber-500 border-amber-500/20 shrink-0 px-1.5 sm:px-2.5"
                    >
                      Held
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-muted-foreground uppercase tracking-wider font-medium flex-wrap">
                    <span className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />{" "}
                      {new Date(item.created_at).toLocaleTimeString()}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                    <span className="shrink-0">
                      {getItemCount(item.items_json)} Items
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-0 border-border/50 pt-3 sm:pt-0">
                <div className="text-left sm:text-right shrink-0">
                  <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Total
                  </p>
                  <p className="font-bold text-sm sm:text-lg leading-none mt-0.5 sm:mt-1">
                    {formatCurrency(item.total_amount, storeProfile?.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="destructive"
                    size="icon"
                    aria-label={`Discard held sale for ${item.customer_name || "Walk-in Customer"}`}
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl shrink-0"
                    onClick={() => setDeleteTarget(item)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </Button>
                  <Button
                    variant="default"
                    className="h-9 sm:h-10 px-3 sm:px-4 rounded-lg sm:rounded-xl text-xs sm:text-base font-bold bg-primary hover:bg-primary/90 shrink-0"
                    onClick={() => onRecall(item)}
                    disabled={deletingId === item.id}
                  >
                    <PlayCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                    Recall
                  </Button>
                </div>
              </div>
            </div>
          ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) handleDelete(target.id);
        }}
        title="Discard held sale?"
        description={`The held sale for ${deleteTargetName} will be permanently discarded. This can't be undone.`}
        confirmLabel="Discard sale"
        variant="destructive"
      />
    </ResponsiveModal>
  );
}

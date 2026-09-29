import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import {
  StockMovement,
  getTypeColor,
  getTypeLabel,
  formatMovementDate,
  formatMovementTime,
} from "./stock-movement-utils";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { markStockTransferReviewed } from "@/lib/db/queries/stock-transfers";

interface Props {
  movement: StockMovement | null;
  onClose: () => void;
  onViewInCatalog: () => void;
  onReviewed?: () => void;
}

export function StockMovementDetailModal({
  movement,
  onClose,
  onViewInCatalog,
  onReviewed,
}: Props) {
  const capsClass = useUppercaseDisplayClass();
  const canReviewTransfers = useHasPermission("approve_stock_transfers");
  const [reviewing, setReviewing] = useState(false);

  const isTransfer = !!movement?.type.toLowerCase().startsWith("transfer_");
  const isFlagged = !!movement?.needsReview && isTransfer;
  const canMarkReviewed =
    isFlagged && canReviewTransfers && !!movement?.reference;

  const handleMarkReviewed = async () => {
    if (!movement?.reference || reviewing) return;
    setReviewing(true);
    try {
      const cleared = await markStockTransferReviewed(movement.reference);
      toast.success(
        cleared > 0
          ? "Transfer marked as reviewed"
          : "This transfer was already reviewed",
      );
      onReviewed?.();
      onClose();
    } catch (error) {
      console.error("Failed to mark transfer reviewed:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to mark the transfer reviewed",
      );
    } finally {
      setReviewing(false);
    }
  };

  return (
    <ResponsiveModal
      open={!!movement}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Movement detail"
      className="md:max-w-[440px] p-0 gap-0 overflow-hidden"
      headerClassName="px-5 pt-0 sm:pb-4 sm:pt-4 border-b border-border m-0"
    >
      {movement && (
        <div className="px-5 py-[18px]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className={`text-[15px] font-semibold ${capsClass}`}>
                {movement.product}
              </div>
              <div className="text-[12px] text-muted-foreground/70">
                {formatMovementDate(movement.date)},{" "}
                {formatMovementTime(movement.date)}
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize inline-block ${getTypeColor(movement.type)}`}
              >
                {getTypeLabel(movement.type)}
              </span>
              <div
                className={`text-[18px] font-semibold mt-1 ${movement.quantity > 0 ? "text-emerald-700" : "text-destructive"}`}
              >
                {movement.quantity > 0 && "+"}
                {movement.quantity}
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-3.5 flex flex-col gap-3">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                Reference / reason
              </div>
              <div className="text-[13px] text-foreground">
                {movement.reference || movement.reason || "-"}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                Recorded by
              </div>
              <div className="text-[13px] text-foreground">{movement.user}</div>
            </div>
          </div>
          {isFlagged && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                Needs Review
              </div>
              <p className="text-[12px] text-amber-700/80 mt-0.5 dark:text-amber-400/80">
                Requested by a member of staff rather than an owner. The stock
                has already moved. This is a check that it was meant to.
              </p>
              {canMarkReviewed && (
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={handleMarkReviewed}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-background px-3 py-1.5 text-[12px] font-semibold text-amber-700 outline-none transition-colors hover:bg-amber-100 focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-60 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/20"
                >
                  {reviewing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Mark Reviewed
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            className="text-[12px] font-semibold text-primary mt-5 cursor-pointer hover:underline rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            onClick={onViewInCatalog}
          >
            View product in Catalog →
          </button>
        </div>
      )}
    </ResponsiveModal>
  );
}

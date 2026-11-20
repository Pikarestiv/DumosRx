"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isValidBatchCostPrice } from "@/lib/db/queries/batch-cost-correction";
import { useCorrectBatchCostMutation } from "@/lib/hooks/use-correct-batch-cost-mutation";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import type { BatchCostReason } from "@/lib/constants/batch-cost-reasons";
import { fefoSellOrder, isSoldOut, lastReceivedBatch, previewBatchCostChange } from "@/lib/utils/batch-cost-breakdown";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { CostBatchRow, batchLabel, gridFor, type RowEditing } from "./cost-breakdown-rows";
import { CostCorrectionPreview, CostWorkedOut } from "./cost-breakdown-summary";
import type { StockBatch } from "@/lib/types/stock-batch";

export interface CostBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  batches: StockBatch[];
  sellingPrice?: number | null;
  formatPrice: (amount: number) => string;
  canEditCost?: boolean;
  canSeeQuantities?: boolean;
  initialEditBatchId?: string | null;
  onChangeSellingPrice?: () => void;
}

const DIVIDER = "border-slate-200 dark:border-slate-800";

export function CostBreakdownDialog({
  open,
  onOpenChange,
  productName,
  batches,
  sellingPrice,
  formatPrice,
  canEditCost = true,
  canSeeQuantities = true,
  initialEditBatchId = null,
  onChangeSellingPrice,
}: CostBreakdownDialogProps) {
  const [editingBatchId, setEditingBatchId] = useState<string | null>(initialEditBatchId);
  const [costInput, setCostInput] = useState(() => String(batches.find((b) => b.id === initialEditBatchId)?.cost_price ?? ""));
  const [reason, setReason] = useState<BatchCostReason>("typo_at_receiving");
  const [showSoldOut, setShowSoldOut] = useState(() => batches.some((b) => b.id === initialEditBatchId && isSoldOut(b)));
  const correctCost = useCorrectBatchCostMutation();
  const displayName = useDisplayName();

  const activeBatches = batches.filter((b) => !isSoldOut(b));
  const soldOutBatches = batches.filter(isSoldOut);
  const latestBatch = lastReceivedBatch(batches);
  const sellsFirstId = fefoSellOrder(batches)[0]?.id;

  const editingBatch = editingBatchId ? batches.find((b) => b.id === editingBatchId) : undefined;
  const newCost = costInput.trim() === "" ? Number.NaN : Number(costInput);
  const isValid = isValidBatchCostPrice(newCost);
  const isChanged = Boolean(editingBatch) && isValid && roundMoney(newCost) !== (editingBatch?.cost_price ?? 0);
  const preview = isChanged && editingBatch ? previewBatchCostChange(batches, editingBatch.id, newCost, sellingPrice) : null;

  const startEdit = (batch: StockBatch) => {
    setEditingBatchId(batch.id);
    setCostInput(String(batch.cost_price ?? ""));
  };
  const cancelEdit = () => {
    setEditingBatchId(null);
    setCostInput("");
  };
  const close = () => {
    cancelEdit();
    setShowSoldOut(false);
    onOpenChange(false);
  };

  const save = async () => {
    if (!editingBatch || !isChanged) return;
    try {
      await correctCost.mutateAsync({ batchId: editingBatch.id, costPrice: roundMoney(newCost), reason });
      toast.success(`Cost price updated for batch ${batchLabel(editingBatch)}`);
      if (initialEditBatchId) close();
      else cancelEdit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the cost price");
    }
  };

  const rowFor = (batch: StockBatch) => {
    const editing: RowEditing | null = batch.id === editingBatchId
      ? { costInput, onCostInput: setCostInput, reason, onReason: setReason, newCost, isValid, isChanged }
      : null;
    return (
      <CostBatchRow
        key={batch.id}
        batch={batch}
        batches={batches}
        isLatest={latestBatch?.id === batch.id}
        sellsFirst={batch.id === sellsFirstId}
        canEdit={canEditCost}
        canSeeQuantities={canSeeQuantities}
        formatPrice={formatPrice}
        sellingPrice={sellingPrice}
        editing={editing}
        onEdit={() => startEdit(batch)}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[460px] p-0 gap-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl"
      >
        <DialogHeader className={`px-5 py-4 border-b ${DIVIDER}`}>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">Cost breakdown</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {displayName(productName)} · {activeBatches.length} {activeBatches.length === 1 ? "batch" : "batches"} in stock
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto stable-scrollbar">
          {batches.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No batches received yet.</p>
          ) : (
            <>
              <div className={`${gridFor(canSeeQuantities)} px-5 py-2.5 text-xs font-medium text-muted-foreground border-b ${DIVIDER}`}>
                <span>Batch</span>
                {canSeeQuantities && <span className="text-right">Units left</span>}
                <span className="text-right">Cost</span>
                <span />
              </div>
              <ul className={`divide-y divide-slate-200 dark:divide-slate-800`}>{activeBatches.map(rowFor)}</ul>
              {soldOutBatches.length > 0 && (
                <div className={`border-t ${DIVIDER}`}>
                  <button
                    type="button"
                    onClick={() => setShowSoldOut(!showSoldOut)}
                    className="flex w-full items-center gap-2 px-5 py-3 text-xs text-primary font-semibold hover:bg-muted/30"
                  >
                    {showSoldOut ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {showSoldOut
                      ? "Hide sold-out batches"
                      : `Show ${soldOutBatches.length} sold-out batch${soldOutBatches.length === 1 ? "" : "es"}`}
                  </button>
                  {showSoldOut && <ul className={`divide-y divide-slate-200 dark:divide-slate-800 border-t ${DIVIDER}`}>{soldOutBatches.map(rowFor)}</ul>}
                </div>
              )}
              <CostWorkedOut batches={batches} canSeeQuantities={canSeeQuantities} formatPrice={formatPrice} />
              {preview && (
                <CostCorrectionPreview
                  preview={preview}
                  sellingPrice={sellingPrice}
                  canSeeQuantities={canSeeQuantities}
                  formatPrice={formatPrice}
                  onChangeSellingPrice={onChangeSellingPrice && (() => {
                    close();
                    onChangeSellingPrice();
                  })}
                />
              )}
            </>
          )}
        </div>

        <div className={`p-4 border-t ${DIVIDER} flex items-center gap-3`}>
          <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={editingBatchId && !initialEditBatchId ? cancelEdit : close}>
            {editingBatchId ? "Cancel" : "Close"}
          </Button>
          {editingBatchId && (
            <Button
              disabled={!isChanged || correctCost.isPending}
              onClick={() => void save()}
              className="flex-[2] h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
            >
              {correctCost.isPending ? "Saving…" : "Save correction"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

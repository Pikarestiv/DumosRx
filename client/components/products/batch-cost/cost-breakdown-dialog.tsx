"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isValidBatchCostPrice } from "@/lib/db/queries/batch-cost-correction";
import { detailsFormOf, validateBatchDetails, type BatchDetailsForm } from "@/lib/db/queries/batch-details-correction";
import { useCorrectBatchCostMutation } from "@/lib/hooks/use-correct-batch-cost-mutation";
import { useCorrectBatchDetailsMutation } from "@/lib/hooks/use-correct-batch-details-mutation";
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
  canEdit?: boolean;
  canViewCost?: boolean;
  canSeeQuantities?: boolean;
  initialEditBatchId?: string | null;
  onChangeSellingPrice?: () => void;
}

const DIVIDER = "border-slate-200 dark:border-slate-800";
const EMPTY_FORM: BatchDetailsForm = { batch_number: "", expiry_date: "", manufacture_date: "" };

export function CostBreakdownDialog({
  open,
  onOpenChange,
  productName,
  batches,
  sellingPrice,
  formatPrice,
  canEdit = true,
  canViewCost = true,
  canSeeQuantities = true,
  initialEditBatchId = null,
  onChangeSellingPrice,
}: CostBreakdownDialogProps) {
  const initialBatch = batches.find((b) => b.id === initialEditBatchId);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(initialBatch?.id ?? null);
  const [costInput, setCostInput] = useState(String(initialBatch?.cost_price ?? ""));
  const [form, setForm] = useState<BatchDetailsForm>(initialBatch ? detailsFormOf(initialBatch) : EMPTY_FORM);
  const [reason, setReason] = useState<BatchCostReason>("typo_at_receiving");
  const [showSoldOut, setShowSoldOut] = useState(Boolean(initialBatch && isSoldOut(initialBatch)));
  const correctCost = useCorrectBatchCostMutation();
  const correctDetails = useCorrectBatchDetailsMutation();
  const displayName = useDisplayName();

  const activeBatches = batches.filter((b) => !isSoldOut(b));
  const soldOutBatches = batches.filter(isSoldOut);
  const latestBatch = lastReceivedBatch(batches);
  const sellsFirstId = fefoSellOrder(batches)[0]?.id;

  const editingBatch = editingBatchId ? batches.find((b) => b.id === editingBatchId) : undefined;
  const original = editingBatch ? detailsFormOf(editingBatch) : EMPTY_FORM;
  const newCost = costInput.trim() === "" ? Number.NaN : Number(costInput);
  const isCostValid = !canViewCost || isValidBatchCostPrice(newCost);
  const isCostChanged = canViewCost && Boolean(editingBatch) && isCostValid && roundMoney(newCost) !== (editingBatch?.cost_price ?? 0);
  const isDetailsChanged = (Object.keys(form) as (keyof BatchDetailsForm)[]).some((key) => form[key].trim() !== original[key]);
  const detailsError = editingBatch ? validateBatchDetails(form, original) : null;
  const canSave = (isCostChanged || isDetailsChanged) && isCostValid && !detailsError;
  const isSaving = correctCost.isPending || correctDetails.isPending;
  const preview = isCostChanged && editingBatch ? previewBatchCostChange(batches, editingBatch.id, newCost, sellingPrice) : null;

  const startEdit = (batch: StockBatch) => {
    setEditingBatchId(batch.id);
    setCostInput(String(batch.cost_price ?? ""));
    setForm(detailsFormOf(batch));
  };
  const cancelEdit = () => {
    setEditingBatchId(null);
    setCostInput("");
    setForm(EMPTY_FORM);
  };
  const close = () => {
    cancelEdit();
    setShowSoldOut(false);
    onOpenChange(false);
  };

  const save = async () => {
    if (!editingBatch || !canSave) return;
    let detailsSaved = false;
    try {
      if (isDetailsChanged) {
        await correctDetails.mutateAsync({ batchId: editingBatch.id, details: form });
        detailsSaved = true;
      }
      if (isCostChanged) await correctCost.mutateAsync({ batchId: editingBatch.id, costPrice: roundMoney(newCost), reason });
      toast.success(`Batch ${batchLabel(editingBatch)} updated`);
      if (initialEditBatchId) close();
      else cancelEdit();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update the batch";
      toast.error(detailsSaved ? `The batch details were saved, but the cost price was not: ${message}` : message);
    }
  };

  const rowFor = (batch: StockBatch) => {
    const editing: RowEditing | null = batch.id === editingBatchId
      ? {
          costInput, onCostInput: setCostInput, newCost, isCostValid, isCostChanged, reason, onReason: setReason,
          details: form, onDetails: (patch) => setForm({ ...form, ...patch }), detailsError, isDetailsChanged,
        }
      : null;
    return (
      <CostBatchRow
        key={batch.id}
        batch={batch}
        batches={batches}
        isLatest={latestBatch?.id === batch.id}
        sellsFirst={batch.id === sellsFirstId}
        canEdit={canEdit}
        canViewCost={canViewCost}
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
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                {canViewCost ? "Cost breakdown" : "Batch details"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {displayName(productName)} · {activeBatches.length} {activeBatches.length === 1 ? "batch" : "batches"} in stock
              </DialogDescription>
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
              <div className={`${gridFor(canSeeQuantities, canViewCost)} px-5 py-2.5 text-xs font-medium text-muted-foreground border-b ${DIVIDER}`}>
                <span>Batch</span>
                {canSeeQuantities && <span className="text-right">Units left</span>}
                {canViewCost && <span className="text-right">Cost</span>}
                <span />
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">{activeBatches.map(rowFor)}</ul>
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
              {canViewCost && <CostWorkedOut batches={batches} canSeeQuantities={canSeeQuantities} formatPrice={formatPrice} />}
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
              disabled={!canSave || isSaving}
              onClick={() => void save()}
              className="flex-[2] h-11 rounded-xl bg-primary text-primary-foreground font-semibold"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

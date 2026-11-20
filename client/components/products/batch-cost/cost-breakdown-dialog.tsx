"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCorrectBatchCostMutation } from "@/lib/hooks/use-correct-batch-cost-mutation";
import { BATCH_COST_REASONS, type BatchCostReason } from "@/lib/constants/batch-cost-reasons";
import {
  averageCostTerms,
  isSoldOut,
  lastReceivedBatch,
  previewBatchCostChange,
  stockValue,
} from "@/lib/utils/batch-cost-breakdown";
import { formatDateSafe, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { formatPONumber } from "@/lib/utils/po-number";
import { roundMoney } from "@/lib/utils/pos-calculations";
import type { StockBatch } from "@/lib/types/stock-batch";

interface CostBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  batches: StockBatch[];
  sellingPrice?: number | null;
  currencyCode?: string;
  formatPrice: (amount: number) => string;
  canEditCost?: boolean;
}

export function CostBreakdownDialog({
  open,
  onOpenChange,
  productName,
  batches,
  sellingPrice,
  currencyCode = "NGN",
  formatPrice,
  canEditCost = true,
}: CostBreakdownDialogProps) {
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [costInput, setCostInput] = useState("");
  const [reason, setReason] = useState<BatchCostReason>("typo_at_receiving");
  const [showSoldOut, setShowSoldOut] = useState(false);
  const correctCost = useCorrectBatchCostMutation();

  const activeBatches = batches.filter((b) => !isSoldOut(b));
  const soldOutBatches = batches.filter(isSoldOut);
  const latestBatch = lastReceivedBatch(batches);
  const { terms, units, average } = averageCostTerms(batches);

  const editingBatch = editingBatchId ? batches.find((b) => b.id === editingBatchId) : null;
  const newCost = costInput.trim() === "" ? Number.NaN : Number(costInput);
  const isChanged = editingBatch && Number.isFinite(newCost) && newCost >= 0 && roundMoney(newCost) !== (editingBatch.cost_price ?? 0);
  const preview = isChanged && editingBatch ? previewBatchCostChange(batches, editingBatch.id, newCost, sellingPrice) : null;

  const startEdit = (batch: StockBatch) => {
    setEditingBatchId(batch.id);
    setCostInput(String(batch.cost_price ?? ""));
  };

  const cancelEdit = () => {
    setEditingBatchId(null);
    setCostInput("");
  };

  const handleSave = async () => {
    if (!editingBatch || !isChanged) return;
    try {
      await correctCost.mutateAsync({
        batchId: editingBatch.id,
        costPrice: roundMoney(newCost),
        reason,
      });
      toast.success("Cost price updated");
      cancelEdit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update cost price");
    }
  };

  const currentStockVal = stockValue(batches);
  const currentMargin = sellingPrice && average && sellingPrice > 0 ? (((sellingPrice - average) / sellingPrice) * 100).toFixed(1) : null;
  const newMargin = preview && sellingPrice && preview.average?.to != null && sellingPrice > 0
    ? (((sellingPrice - preview.average.to) / sellingPrice) * 100).toFixed(1)
    : null;

  const GRID = "grid grid-cols-[1fr_72px_96px_28px] items-center gap-x-2";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[460px] p-0 gap-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl"
      >
        <DialogHeader className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                Cost breakdown
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {productName} · {activeBatches.length} {activeBatches.length === 1 ? "batch" : "batches"} in stock
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto stable-scrollbar">
          <div className={`${GRID} px-5 py-2.5 text-xs font-medium text-muted-foreground border-b border-slate-200 dark:border-slate-800`}>
            <span>Batch</span>
            <span className="text-right">Units left</span>
            <span className="text-right">Cost</span>
            <span />
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeBatches.map((batch) => {
              const isLatest = latestBatch?.id === batch.id;
              const isCurrentEdit = editingBatchId === batch.id;
              const vendorOrPo = batch.purchase_order_id ? `PO ${formatPONumber(batch.purchase_order_id)}` : batch.supplier_name || "Direct";
              const expiryText = batch.expiry_date?.trim() ? `exp ${formatDateToDDMMYYYY(batch.expiry_date)}` : "no expiry";

              return (
                <div key={batch.id} className={isCurrentEdit ? "bg-primary/5" : undefined}>
                  <div className={`${GRID} px-5 py-3 text-xs`}>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground text-[13px]">
                        Received {formatDateSafe(batch.created_at ?? "", "dd/MM/yyyy", "date unknown")}
                        {isLatest && <span> · latest</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {vendorOrPo} · {expiryText}
                      </div>
                    </div>
                    <div className="text-right font-medium text-foreground tabular-nums">{batch.quantity}</div>
                    {isCurrentEdit ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] line-through text-muted-foreground tabular-nums">
                          {formatPrice(batch.cost_price ?? 0)}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={costInput}
                          onChange={(e) => setCostInput(e.target.value)}
                          className="h-9 w-24 text-right font-bold text-sm px-2 border-primary ring-1 ring-primary"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div className="text-right font-bold text-foreground tabular-nums">{formatPrice(batch.cost_price ?? 0)}</div>
                    )}
                    {canEditCost && !isCurrentEdit ? (
                      <button
                        type="button"
                        aria-label="Edit cost"
                        onClick={() => startEdit(batch)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>

                  {isCurrentEdit && (
                    <div className="px-5 pb-4 space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Reason</label>
                      <Select value={reason} onValueChange={(val) => setReason(val as BatchCostReason)}>
                        <SelectTrigger className="h-10 w-full text-sm bg-white dark:bg-slate-900">
                          <SelectValue placeholder="Select reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {BATCH_COST_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value} className="text-sm">
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {soldOutBatches.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSoldOut(!showSoldOut)}
                className="flex w-full items-center gap-2 px-5 py-3 text-xs text-primary font-semibold hover:bg-muted/30"
              >
                {showSoldOut ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showSoldOut ? "Hide sold-out batches" : `Show sold-out batches (read-only)`}
              </button>

              {showSoldOut && (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 opacity-60">
                  {soldOutBatches.map((b) => (
                    <div key={b.id} className={`${GRID} px-5 py-2 text-xs`}>
                      <span className="truncate">Batch #{b.batch_number || "Default"}</span>
                      <span className="text-right">0</span>
                      <span className="text-right tabular-nums">{formatPrice(b.cost_price ?? 0)}</span>
                      <span />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-4 bg-muted/40 border-y border-slate-200 dark:border-slate-800 space-y-1">
            <div className="text-xs font-bold text-foreground">
              How {average != null ? formatPrice(average) : formatPrice(0)} is worked out
            </div>
            <p className="text-[13px] text-foreground leading-relaxed">
              ({terms.map((t) => `${t.units} × ${formatPrice(t.cost)}`).join(" + ")}) ÷ {units} units
            </p>
            {latestBatch && (
              <p className="text-[11px] text-muted-foreground">
                &ldquo;Last cost&rdquo; is the latest batch received: {formatPrice(latestBatch.cost_price ?? 0)}.
              </p>
            )}
          </div>

          {preview && (
            <div className="px-5 py-4 space-y-2 text-[13px]">
              <div className="text-xs font-bold text-foreground">After this correction</div>
              <PreviewRow label="Avg cost" value={`${formatPrice(preview.average?.from ?? 0)} → ${formatPrice(preview.average?.to ?? 0)}`} />
              <PreviewRow label="Stock value" value={`${formatPrice(preview.stockValue.from)} → ${formatPrice(preview.stockValue.to)}`} />
              {currentMargin && newMargin && (
                <PreviewRow label={`Margin at ${formatPrice(sellingPrice ?? 0)}`} value={`${currentMargin}% → ${newMargin}%`} />
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={editingBatchId ? cancelEdit : () => onOpenChange(false)}>
            Cancel
          </Button>
          {editingBatchId && (
            <Button
              disabled={!isChanged || correctCost.isPending}
              onClick={handleSave}
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

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

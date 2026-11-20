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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
        <DialogHeader className="p-5 pb-3 border-b border-border/60">
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
              onClick={() => onOpenChange(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto stable-scrollbar">
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_80px_100px] text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/40">
              <span>Batch</span>
              <span className="text-center">Units left</span>
              <span className="text-right">Cost</span>
            </div>

            <div className="divide-y divide-border/40">
              {activeBatches.map((batch) => {
                const isLatest = latestBatch?.id === batch.id;
                const isCurrentEdit = editingBatchId === batch.id;
                const vendorOrPo = batch.purchase_order_id ? `PO ${formatPONumber(batch.purchase_order_id)}` : batch.supplier_name || "Direct";
                const expiryText = batch.expiry_date?.trim() ? `exp ${formatDateToDDMMYYYY(batch.expiry_date)}` : "no expiry";

                return (
                  <div key={batch.id} className="py-2.5 space-y-2">
                    <div className="grid grid-cols-[1fr_80px_100px] items-center text-xs">
                      <div>
                        <div className="font-semibold text-foreground">
                          Received {formatDateSafe(batch.created_at ?? "", "dd/MM/yyyy", "date unknown")}
                          {isLatest && <span className="font-medium text-muted-foreground"> · latest</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {vendorOrPo} · {expiryText}
                        </div>
                      </div>

                      <div className="text-center font-semibold text-foreground">
                        {batch.quantity}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 font-bold tabular-nums">
                        {!isCurrentEdit ? (
                          <>
                            <span>{formatPrice(batch.cost_price ?? 0)}</span>
                            {canEditCost && (
                              <button
                                type="button"
                                onClick={() => startEdit(batch)}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-[11px] line-through text-muted-foreground">
                              {formatPrice(batch.cost_price ?? 0)}
                            </span>
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={costInput}
                              onChange={(e) => setCostInput(e.target.value)}
                              className="h-8 w-20 text-right font-bold text-xs p-1"
                              autoFocus
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {isCurrentEdit && (
                      <div className="space-y-1 pt-1 border-t border-border/30">
                        <label className="text-[11px] font-medium text-muted-foreground">Reason</label>
                        <Select value={reason} onValueChange={(val) => setReason(val as BatchCostReason)}>
                          <SelectTrigger className="h-8 text-xs bg-muted/30">
                            <SelectValue placeholder="Select reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {BATCH_COST_REASONS.map((r) => (
                              <SelectItem key={r.value} value={r.value} className="text-xs">
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
          </div>

          {soldOutBatches.length > 0 && (
            <div className="border-t border-border/40 pt-2">
              <button
                type="button"
                onClick={() => setShowSoldOut(!showSoldOut)}
                className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
              >
                {showSoldOut ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showSoldOut ? "Hide sold-out batches" : `Show ${soldOutBatches.length} sold-out batches (read-only)`}
              </button>

              {showSoldOut && (
                <div className="divide-y divide-border/30 pt-2 opacity-60">
                  {soldOutBatches.map((b) => (
                    <div key={b.id} className="grid grid-cols-[1fr_80px_100px] py-1.5 text-xs">
                      <span className="truncate">Batch #{b.batch_number || "Default"}</span>
                      <span className="text-center">0</span>
                      <span className="text-right">{formatPrice(b.cost_price ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/50 space-y-1 text-xs">
            <div className="font-bold text-foreground">
              How {average != null ? formatPrice(average) : "₦0"} is worked out
            </div>
            <p className="text-muted-foreground text-[11.5px] leading-relaxed">
              ({terms.map((t) => `${t.units} × ${formatPrice(t.cost)}`).join(" + ")}) ÷ {units} units
            </p>
            {latestBatch && (
              <p className="text-[11px] text-muted-foreground pt-0.5">
                &ldquo;Last cost&rdquo; is the latest batch received: <span className="font-semibold text-foreground">{formatPrice(latestBatch.cost_price ?? 0)}</span>.
              </p>
            )}
          </div>

          {preview && (
            <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 space-y-2 text-xs">
              <div className="font-bold text-foreground">After this correction</div>
              <div className="grid grid-cols-2 gap-y-1.5 text-muted-foreground">
                <span>Avg cost</span>
                <span className="text-right font-semibold text-foreground">
                  {formatPrice(preview.average?.from ?? 0)} → {formatPrice(preview.average?.to ?? 0)}
                </span>
                <span>Stock value</span>
                <span className="text-right font-semibold text-foreground">
                  {formatPrice(preview.stockValue.from)} → {formatPrice(preview.stockValue.to)}
                </span>
                {currentMargin && newMargin && (
                  <>
                    <span>Margin at {formatPrice(sellingPrice ?? 0)}</span>
                    <span className="text-right font-semibold text-foreground">
                      {currentMargin}% → {newMargin}%
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/10">
          <Button variant="outline" size="sm" onClick={editingBatchId ? cancelEdit : () => onOpenChange(false)}>
            Cancel
          </Button>
          {editingBatchId && (
            <Button
              size="sm"
              disabled={!isChanged || correctCost.isPending}
              onClick={handleSave}
              className="bg-primary text-primary-foreground font-semibold"
            >
              {correctCost.isPending ? "Saving…" : "Save correction"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

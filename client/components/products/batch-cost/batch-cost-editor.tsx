"use client";

import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrencySymbol } from "@/lib/utils";
import { isValidBatchCostPrice } from "@/lib/db/queries/batch-cost-correction";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { useCorrectBatchCostMutation } from "@/lib/hooks/use-correct-batch-cost-mutation";
import { BATCH_COST_REASONS, type BatchCostReason } from "@/lib/constants/batch-cost-reasons";
import { batchesSellingBefore, previewBatchCostChange, unusualCostWarning } from "@/lib/utils/batch-cost-breakdown";
import { BatchCostPreviewList } from "./batch-cost-preview-list";
import type { StockBatch } from "@/lib/types/stock-batch";

export interface BatchCostEditorProps {
  batch: StockBatch;
  batches: StockBatch[];
  sellingPrice?: number | null;
  canSeeQuantities: boolean;
  currencyCode?: string;
  formatPrice: (amount: number) => string;
  onSaved: () => void;
  onCancel: () => void;
  onChangeSellingPrice?: () => void;
}

export const batchLabel = (batch: Pick<StockBatch, "batch_number">) => batch.batch_number || "Default";

function parseCost(input: string): number {
  return input.trim() === "" ? Number.NaN : Number(input);
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function BatchCostEditor({
  batch,
  batches,
  sellingPrice,
  canSeeQuantities,
  currencyCode,
  formatPrice,
  onSaved,
  onCancel,
  onChangeSellingPrice,
}: BatchCostEditorProps) {
  const inputId = useId();
  const currentCost = batch.cost_price ?? 0;
  const [costInput, setCostInput] = useState(String(currentCost));
  const [reason, setReason] = useState<BatchCostReason | undefined>();
  const correctCost = useCorrectBatchCostMutation();

  const newCost = parseCost(costInput);
  const isValid = isValidBatchCostPrice(newCost);
  const isChanged = isValid && roundMoney(newCost) !== currentCost;
  const unusual = isChanged ? unusualCostWarning(batches, batch.id, newCost) : null;
  const sellsBefore = batchesSellingBefore(batches, batch.id);
  const unitPrefix = currencyCode ? `${getCurrencySymbol(currencyCode)} ` : "";

  const save = async () => {
    try {
      await correctCost.mutateAsync({ batchId: batch.id, costPrice: newCost, reason });
      toast.success(`Cost price updated for batch ${batchLabel(batch)}`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the cost price");
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Current cost: {formatPrice(currentCost)} per unit</p>
        <Label htmlFor={inputId} className="text-xs font-semibold">
          New cost price ({unitPrefix}per unit)
        </Label>
        <Input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={costInput}
          onChange={(e) => setCostInput(e.target.value)}
          aria-invalid={!isValid}
          className="h-10 text-base font-semibold"
        />
        {!isValid && <p className="text-xs text-destructive">Enter a cost price of 0 or more.</p>}
      </div>

      <div role="group" aria-label="Reason (optional)" className="flex flex-wrap gap-1.5">
        {BATCH_COST_REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={reason === r.value}
            onClick={() => setReason((prev) => (prev === r.value ? undefined : r.value))}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              reason === r.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {unusual?.kind === "zero" && (
        <Warning>A cost of 0 books the whole selling price as profit on every unit sold from this batch.</Warning>
      )}
      {unusual?.kind === "far" && (
        <Warning>
          This is far from this product&apos;s other batches (about {formatPrice(unusual.reference)}). Check for an
          extra or missing zero.
        </Warning>
      )}
      {sellsBefore.map((earlier) => (
        <Warning key={earlier.id}>
          Batch {batchLabel(earlier)} (
          {canSeeQuantities ? `${earlier.quantity} units at ` : "at "}
          {formatPrice(earlier.cost_price ?? 0)}) will sell before this one.
          {sellingPrice != null && sellingPrice > 0 && (earlier.cost_price ?? 0) >= sellingPrice &&
            " It costs at or above the selling price, so those sales make no profit."}
        </Warning>
      ))}

      {isChanged && (
        <BatchCostPreviewList
          preview={previewBatchCostChange(batches, batch.id, newCost, sellingPrice)}
          sellingPrice={sellingPrice}
          canSeeQuantities={canSeeQuantities}
          formatPrice={formatPrice}
          onChangeSellingPrice={onChangeSellingPrice}
        />
      )}

      <p className="text-xs text-muted-foreground">
        Sales already made from this batch keep the cost they were sold at, so their profit does not change. Future
        sales from this batch, stock value and the average use the new cost.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={correctCost.isPending}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={!isChanged || correctCost.isPending}>
          {correctCost.isPending ? "Saving..." : "Save cost"}
        </Button>
      </div>
    </div>
  );
}

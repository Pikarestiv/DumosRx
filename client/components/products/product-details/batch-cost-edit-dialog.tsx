"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrencySymbol } from "@/lib/utils";
import { isValidBatchCostPrice } from "@/lib/db/queries/batch-cost-correction";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { useCorrectBatchCostMutation } from "@/lib/hooks/use-correct-batch-cost-mutation";
import type { StockBatch } from "@/lib/types/stock-batch";

interface BatchCostEditDialogProps {
  batch: StockBatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
}

function parseCost(input: string): number {
  return input.trim() === "" ? Number.NaN : Number(input);
}

export function BatchCostEditDialog({
  batch,
  open,
  onOpenChange,
  currencyCode,
  canSeeQuantities,
  formatPrice,
}: BatchCostEditDialogProps) {
  const currentCost = batch?.cost_price ?? 0;
  const [costInput, setCostInput] = useState(String(currentCost));
  const [confirming, setConfirming] = useState(false);
  const correctCost = useCorrectBatchCostMutation();

  if (!batch) return null;

  const newCost = parseCost(costInput);
  const isValid = isValidBatchCostPrice(newCost);
  const isChanged = isValid && roundMoney(newCost) !== currentCost;
  const batchLabel = batch.batch_number || "Default";
  const showStockValue = canSeeQuantities && batch.quantity > 0;

  const save = async () => {
    try {
      await correctCost.mutateAsync({ batchId: batch.id, costPrice: newCost });
      toast.success(`Cost price updated for batch ${batchLabel}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the cost price");
    }
  };

  const footer = confirming ? (
    <div className="flex w-full justify-end gap-2">
      <Button variant="ghost" onClick={() => setConfirming(false)} disabled={correctCost.isPending}>
        Back
      </Button>
      <Button onClick={() => void save()} disabled={correctCost.isPending}>
        {correctCost.isPending ? "Saving..." : "Confirm change"}
      </Button>
    </div>
  ) : (
    <div className="flex w-full justify-end gap-2">
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={() => setConfirming(true)} disabled={!isChanged}>
        Review change
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => !correctCost.isPending && onOpenChange(next)}
      title={`Edit cost price · Batch #${batchLabel}`}
      description="Correct a cost price that was entered wrongly when this batch was received."
      footer={footer}
    >
      {confirming ? (
        <div className="space-y-3 py-2 text-sm">
          <p>
            Cost price changes from <strong>{formatPrice(currentCost)}</strong> to{" "}
            <strong>{formatPrice(roundMoney(newCost))}</strong> per unit.
          </p>
          {showStockValue && (
            <p className="text-muted-foreground">
              Stock value of the {batch.quantity} units left changes from{" "}
              {formatPrice(currentCost * batch.quantity)} to {formatPrice(roundMoney(newCost) * batch.quantity)}.
            </p>
          )}
          <p className="text-muted-foreground">
            Past sales keep the cost they were sold at. Future sales from this batch, stock value and the
            product&apos;s average cost use the new price.
          </p>
        </div>
      ) : (
        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">Current cost: {formatPrice(currentCost)} per unit</p>
          <Label htmlFor="batch-cost-input" className="text-xs font-semibold">
            New cost price ({getCurrencySymbol(currencyCode)} per unit)
          </Label>
          <Input
            id="batch-cost-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={costInput}
            onChange={(e) => setCostInput(e.target.value)}
            aria-invalid={!isValid}
            className="h-10 text-base font-semibold"
          />
          {!isValid && (
            <p className="text-xs text-destructive">Enter a cost price of 0 or more.</p>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}

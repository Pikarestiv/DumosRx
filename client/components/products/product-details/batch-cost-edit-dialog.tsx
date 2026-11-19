"use client";

import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { BatchCostEditor, batchLabel } from "@/components/products/batch-cost/batch-cost-editor";
import type { StockBatch } from "@/lib/types/stock-batch";

interface BatchCostEditDialogProps {
  batch: StockBatch | null;
  batches?: StockBatch[];
  sellingPrice?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
  onChangeSellingPrice?: () => void;
}

export function BatchCostEditDialog({
  batch,
  batches,
  sellingPrice,
  open,
  onOpenChange,
  currencyCode,
  canSeeQuantities,
  formatPrice,
  onChangeSellingPrice,
}: BatchCostEditDialogProps) {
  if (!batch) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit cost price · Batch #${batchLabel(batch)}`}
      description="Correct a cost price that was entered wrongly when this batch was received."
    >
      <div className="py-2">
        <BatchCostEditor
          batch={batch}
          batches={batches ?? [batch]}
          sellingPrice={sellingPrice}
          canSeeQuantities={canSeeQuantities}
          currencyCode={currencyCode}
          formatPrice={formatPrice}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          onChangeSellingPrice={onChangeSellingPrice && (() => {
            onOpenChange(false);
            onChangeSellingPrice();
          })}
        />
      </div>
    </ResponsiveModal>
  );
}

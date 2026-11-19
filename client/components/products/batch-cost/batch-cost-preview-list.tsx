"use client";

import type { BatchCostPreview, Change } from "@/lib/utils/batch-cost-breakdown";

interface BatchCostPreviewListProps {
  preview: BatchCostPreview;
  sellingPrice?: number | null;
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
  onChangeSellingPrice?: () => void;
}

function Row({ label, change, formatPrice }: { label: string; change: Change; formatPrice: (n: number) => string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">
        <span className="text-muted-foreground line-through decoration-muted-foreground/50">{formatPrice(change.from)}</span>
        {" → "}
        <span className="font-semibold">{formatPrice(change.to)}</span>
      </dd>
    </div>
  );
}

export function BatchCostPreviewList({
  preview,
  sellingPrice,
  canSeeQuantities,
  formatPrice,
  onChangeSellingPrice,
}: BatchCostPreviewListProps) {
  const showProfit = preview.profitPerUnit && sellingPrice != null;
  return (
    <div className="space-y-1.5 rounded-lg border border-border px-3 py-2 text-xs">
      <dl aria-label="What changes" className="space-y-1.5">
        <Row label="This batch" change={preview.batchCost} formatPrice={formatPrice} />
        {canSeeQuantities && preview.average && <Row label="Average cost" change={preview.average} formatPrice={formatPrice} />}
        {canSeeQuantities && <Row label="Stock value" change={preview.stockValue} formatPrice={formatPrice} />}
        {preview.profitPerUnit && sellingPrice != null && (
          <Row label={`Profit per unit at ${formatPrice(sellingPrice)}`} change={preview.profitPerUnit} formatPrice={formatPrice} />
        )}
      </dl>
      {showProfit && onChangeSellingPrice && (
        <button type="button" onClick={onChangeSellingPrice} className="text-xs font-medium text-primary hover:underline">
          Change selling price
        </button>
      )}
    </div>
  );
}

import { HintTooltip } from "@/components/ui/hint-tooltip";
import { AVG_COST_HINT } from "@/lib/constants/cost-hints";
import { averageCostTerms, lastReceivedBatch, type BatchCostPreview, type Change } from "@/lib/utils/batch-cost-breakdown";
import { receivedAt } from "./cost-breakdown-rows";
import type { StockBatch } from "@/lib/types/stock-batch";

interface WorkedOutProps {
  batches: StockBatch[];
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
}

export function CostWorkedOut({ batches, canSeeQuantities, formatPrice }: WorkedOutProps) {
  const { terms, units, average } = averageCostTerms(batches);
  const last = lastReceivedBatch(batches);
  return (
    <div className="px-5 py-4 bg-muted/40 border-y border-slate-200 dark:border-slate-800 space-y-1">
      {canSeeQuantities && average != null && (
        <>
          <HintTooltip text={AVG_COST_HINT}>
            <div className="text-xs font-bold text-foreground underline decoration-dotted w-fit">
              How {formatPrice(average)} is worked out
            </div>
          </HintTooltip>
          <p className="text-[13px] text-foreground leading-relaxed">
            ({terms.map((t) => `${t.units} × ${formatPrice(t.cost)}`).join(" + ")}) ÷ {units} units
          </p>
        </>
      )}
      {last && (
        <p className="text-[11px] text-muted-foreground">
          &ldquo;Last cost&rdquo; is the latest batch received: {formatPrice(last.cost_price ?? 0)} ({receivedAt(last)}).
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Each sale is costed at the batch it sells from, so profit uses that batch&apos;s cost.
      </p>
    </div>
  );
}

function ChangeRow({ label, change, formatPrice }: { label: string; change: Change; formatPrice: (n: number) => string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold text-foreground tabular-nums">
        {formatPrice(change.from)} → {formatPrice(change.to)}
      </dd>
    </div>
  );
}

interface PreviewProps {
  preview: BatchCostPreview;
  sellingPrice?: number | null;
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
  onChangeSellingPrice?: () => void;
}

export function CostCorrectionPreview({ preview, sellingPrice, canSeeQuantities, formatPrice, onChangeSellingPrice }: PreviewProps) {
  const marginAt = (cost: number) => (sellingPrice && sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : null);
  const margin = preview.average && sellingPrice
    ? { from: marginAt(preview.average.from), to: marginAt(preview.average.to) }
    : null;
  return (
    <div className="px-5 py-4 space-y-2 text-[13px]">
      <div className="text-xs font-bold text-foreground">After this correction</div>
      <dl aria-label="What changes" className="space-y-2">
        {canSeeQuantities && preview.average && <ChangeRow label="Avg cost" change={preview.average} formatPrice={formatPrice} />}
        {canSeeQuantities && <ChangeRow label="Stock value" change={preview.stockValue} formatPrice={formatPrice} />}
        {canSeeQuantities && margin?.from != null && margin.to != null && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Margin at {formatPrice(sellingPrice ?? 0)}</dt>
            <dd className="font-bold text-foreground tabular-nums">
              {margin.from.toFixed(1)}% → {margin.to.toFixed(1)}%
            </dd>
          </div>
        )}
        {preview.profitPerUnit && sellingPrice != null && (
          <ChangeRow label={`Profit per unit at ${formatPrice(sellingPrice)}`} change={preview.profitPerUnit} formatPrice={formatPrice} />
        )}
      </dl>
      {preview.profitPerUnit && onChangeSellingPrice && (
        <button type="button" onClick={onChangeSellingPrice} className="text-xs font-medium text-primary hover:underline">
          Change selling price
        </button>
      )}
    </div>
  );
}

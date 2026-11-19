"use client";

import { useState } from "react";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { AVG_COST_HINT } from "@/lib/constants/cost-hints";
import { formatDateSafe, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { formatPONumber } from "@/lib/utils/po-number";
import { averageCostTerms, fefoSellOrder, isSoldOut, lastReceivedBatch } from "@/lib/utils/batch-cost-breakdown";
import { BatchCostEditor, batchLabel } from "./batch-cost-editor";
import type { StockBatch } from "@/lib/types/stock-batch";

export interface BatchCostBreakdownProps {
  batches: StockBatch[];
  sellingPrice?: number | null;
  canEdit: boolean;
  canSeeQuantities: boolean;
  currencyCode?: string;
  formatPrice: (amount: number) => string;
  onChangeSellingPrice?: () => void;
}

const receivedAt = (b: StockBatch) => formatDateSafe(b.created_at ?? "", "dd/MM/yyyy HH:mm", "date unknown");

function sourceOf(b: StockBatch): string | null {
  if (b.purchase_order_id) return `From ${formatPONumber(b.purchase_order_id)}`;
  return b.supplier_name ? `From ${b.supplier_name}` : null;
}

function BatchRow({ batch, sellsFirst, canEdit, canSeeQuantities, formatPrice, onEdit }: {
  batch: StockBatch;
  sellsFirst: boolean;
  canEdit: boolean;
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
  onEdit: () => void;
}) {
  const details = [
    `Lot ${batchLabel(batch)}`,
    batch.expiry_date?.trim() ? `Exp ${formatDateToDDMMYYYY(batch.expiry_date)}` : "No expiry",
    canSeeQuantities && (isSoldOut(batch) ? "Sold out" : `${batch.quantity} left`),
  ].filter(Boolean);
  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">
          Received {receivedAt(batch)}
          {sourceOf(batch) && <span className="text-muted-foreground"> · {sourceOf(batch)}</span>}
        </div>
        <div className="text-[11px] text-muted-foreground">{details.join(" · ")}</div>
        {sellsFirst && (
          <span className="mt-1 inline-block rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            Sells first
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">{formatPrice(batch.cost_price ?? 0)}</span>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit cost of lot ${batchLabel(batch)}`}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Edit
          </button>
        )}
      </div>
    </li>
  );
}

function AverageFooter({ batches, canSeeQuantities, formatPrice }: {
  batches: StockBatch[];
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
}) {
  const { terms, units, average } = averageCostTerms(batches);
  const last = lastReceivedBatch(batches);
  return (
    <div className="space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
      {canSeeQuantities && average != null && (
        <p>
          <HintTooltip text={AVG_COST_HINT}>
            <span className="font-semibold text-foreground underline decoration-dotted">Average {formatPrice(average)}</span>
          </HintTooltip>
          {" = ("}
          {terms.map((t) => `${t.units} × ${formatPrice(t.cost)}`).join(" + ")}
          {`) / ${units} units`}
        </p>
      )}
      {last && (
        <p>
          Last received: {formatPrice(last.cost_price ?? 0)} ({receivedAt(last)})
        </p>
      )}
      <p>Each sale is costed at the batch it sells from, so profit uses that batch&apos;s cost.</p>
    </div>
  );
}

export function BatchCostBreakdown({
  batches,
  sellingPrice,
  canEdit,
  canSeeQuantities,
  currencyCode,
  formatPrice,
  onChangeSellingPrice,
}: BatchCostBreakdownProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSoldOut, setShowSoldOut] = useState(false);
  const editing = editingId ? batches.find((b) => b.id === editingId) : undefined;

  if (editing) {
    return (
      <BatchCostEditor
        key={editing.id}
        batch={editing}
        batches={batches}
        sellingPrice={sellingPrice}
        canSeeQuantities={canSeeQuantities}
        currencyCode={currencyCode}
        formatPrice={formatPrice}
        onSaved={() => setEditingId(null)}
        onCancel={() => setEditingId(null)}
        onChangeSellingPrice={onChangeSellingPrice}
      />
    );
  }

  if (batches.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">No batches received yet.</p>;
  }

  const sellOrder = fefoSellOrder(batches);
  const inSellOrder = new Set(sellOrder.map((b) => b.id));
  const others = batches
    .filter((b) => !inSellOrder.has(b.id))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const soldOut = others.filter(isSoldOut);
  const visible = [...sellOrder, ...others.filter((b) => !isSoldOut(b)), ...(showSoldOut ? soldOut : [])];

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border">
        {visible.map((b) => (
          <BatchRow
            key={b.id}
            batch={b}
            sellsFirst={b.id === sellOrder[0]?.id}
            canEdit={canEdit}
            canSeeQuantities={canSeeQuantities}
            formatPrice={formatPrice}
            onEdit={() => setEditingId(b.id)}
          />
        ))}
      </ul>
      {soldOut.length > 0 && (
        <button
          type="button"
          onClick={() => setShowSoldOut((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {showSoldOut ? "Hide sold-out batches" : `Show ${soldOut.length} sold-out batch${soldOut.length === 1 ? "" : "es"}`}
        </button>
      )}
      <AverageFooter batches={batches} canSeeQuantities={canSeeQuantities} formatPrice={formatPrice} />
    </div>
  );
}

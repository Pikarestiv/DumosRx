import type { ReactNode } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BATCH_COST_REASONS, type BatchCostReason } from "@/lib/constants/batch-cost-reasons";
import { batchesSellingBefore, isSoldOut, unusualCostWarning } from "@/lib/utils/batch-cost-breakdown";
import { formatDateSafe, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { formatPONumber } from "@/lib/utils/po-number";
import type { StockBatch } from "@/lib/types/stock-batch";

export const batchLabel = (batch: Pick<StockBatch, "batch_number">) => batch.batch_number || "Default";

export const receivedAt = (batch: StockBatch) =>
  formatDateSafe(batch.created_at ?? "", "dd/MM/yyyy HH:mm", "date unknown");

export const gridFor = (canSeeQuantities: boolean) =>
  `grid items-center gap-x-2 ${canSeeQuantities ? "grid-cols-[1fr_72px_96px_28px]" : "grid-cols-[1fr_96px_28px]"}`;

export interface RowEditing {
  costInput: string;
  onCostInput: (value: string) => void;
  reason: BatchCostReason;
  onReason: (value: BatchCostReason) => void;
  newCost: number;
  isValid: boolean;
  isChanged: boolean;
}

interface CostBatchRowProps {
  batch: StockBatch;
  batches: StockBatch[];
  isLatest: boolean;
  sellsFirst: boolean;
  canEdit: boolean;
  canSeeQuantities: boolean;
  formatPrice: (amount: number) => string;
  sellingPrice?: number | null;
  editing: RowEditing | null;
  onEdit: () => void;
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const unitsLabel = (quantity: number) => `${quantity} ${quantity === 1 ? "unit" : "units"}`;

const lotIsPoNumber = (batch: StockBatch) =>
  Boolean(batch.purchase_order_id) && batchLabel(batch) === formatPONumber(batch.purchase_order_id as string).replace(/^PO-/, "");

function sourceOf(batch: StockBatch): string | null {
  if (batch.purchase_order_id) return `From ${formatPONumber(batch.purchase_order_id)}`;
  return batch.supplier_name ? `From ${batch.supplier_name}` : null;
}

function EditFields({ batch, batches, sellingPrice, canSeeQuantities, formatPrice, editing }: Omit<CostBatchRowProps, "isLatest" | "sellsFirst" | "canEdit" | "onEdit" | "editing"> & { editing: RowEditing }) {
  const unusual = editing.isChanged ? unusualCostWarning(batches, batch.id, editing.newCost) : null;
  return (
    <div className="px-5 pb-4 space-y-3">
      {!editing.isValid && <p className="text-xs text-destructive">Enter a cost price of 0 or more.</p>}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Reason</label>
        <Select value={editing.reason} onValueChange={(value) => editing.onReason(value as BatchCostReason)}>
          <SelectTrigger aria-label="Reason" className="h-10 w-full text-sm bg-white dark:bg-slate-900">
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
      <p className="text-xs text-muted-foreground">
        Sales already made from this batch keep the cost they were sold at, so their profit does not change.
      </p>
      {unusual?.kind === "zero" && (
        <Warning>A cost of 0 books the whole selling price as profit on every unit sold from this batch.</Warning>
      )}
      {unusual?.kind === "far" && (
        <Warning>
          This is far from this product&apos;s other batches (about {formatPrice(unusual.reference)}). Check for an
          extra or missing zero.
        </Warning>
      )}
      {batchesSellingBefore(batches, batch.id).map((earlier) => (
        <Warning key={earlier.id}>
          Batch {batchLabel(earlier)} ({canSeeQuantities ? `${unitsLabel(earlier.quantity)} at ` : "at "}
          {formatPrice(earlier.cost_price ?? 0)}) will sell before this one.
          {sellingPrice != null && sellingPrice > 0 && (earlier.cost_price ?? 0) >= sellingPrice &&
            " It costs at or above the selling price, so those sales make no profit."}
        </Warning>
      ))}
    </div>
  );
}

export function CostBatchRow(props: CostBatchRowProps) {
  const { batch, isLatest, sellsFirst, canEdit, canSeeQuantities, formatPrice, editing, onEdit } = props;
  const details = [
    sourceOf(batch),
    lotIsPoNumber(batch) ? null : `Lot ${batchLabel(batch)}`,
    batch.expiry_date?.trim() ? `exp ${formatDateToDDMMYYYY(batch.expiry_date)}` : "no expiry",
  ].filter(Boolean);

  return (
    <li className={editing ? "bg-primary/5" : undefined}>
      <div className={`${gridFor(canSeeQuantities)} px-5 py-3 text-xs`}>
        <div className="min-w-0">
          <div className="font-semibold text-foreground text-[13px]">
            Received {receivedAt(batch)}
            {isLatest && <span> · latest</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">{details.join(" · ")}</div>
          {sellsFirst && (
            <span className="mt-1 inline-block rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              Sells first
            </span>
          )}
        </div>
        {canSeeQuantities && (
          <div className="text-right font-medium text-foreground tabular-nums">
            {isSoldOut(batch) ? "Sold out" : batch.quantity}
          </div>
        )}
        {editing ? (
          <div className="flex flex-col items-end">
            <span className="text-[11px] line-through text-muted-foreground tabular-nums">
              {formatPrice(batch.cost_price ?? 0)}
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              aria-label="New cost price"
              aria-invalid={!editing.isValid}
              value={editing.costInput}
              onChange={(e) => editing.onCostInput(e.target.value)}
              className="h-9 w-24 text-right font-bold text-sm px-2 border-primary ring-1 ring-primary"
              autoFocus
            />
          </div>
        ) : (
          <div className="text-right font-bold text-foreground tabular-nums">{formatPrice(batch.cost_price ?? 0)}</div>
        )}
        {canEdit && !editing ? (
          <button
            type="button"
            aria-label={`Edit cost of lot ${batchLabel(batch)}`}
            onClick={onEdit}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span />
        )}
      </div>
      {editing && <EditFields {...props} editing={editing} />}
    </li>
  );
}

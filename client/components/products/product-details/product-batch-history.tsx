"use client";

import { useState } from "react";
import { Boxes, ChevronDown, ChevronUp } from "lucide-react";
import type { StockBatch } from "@/lib/types/stock-batch";
import { formatCurrency } from "@/lib/utils";
import { formatDateSafe, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

interface ProductBatchHistoryProps {
  batches: StockBatch[];
  loadingBatches: boolean;
  storeType: string;
  canSeeQuantities: boolean;
  formatPrice?: (amount: number) => string;
}

function NoBatchRecordsFound({ storeType }: { storeType: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground italic">
      <Boxes className="w-7 h-7 opacity-30" />
      No batch records found for this{" "}
      {storeType === "pharmacy" ? "product" : "item"}.
    </div>
  );
}

export function ProductBatchHistory({
  batches,
  loadingBatches,
  storeType,
  canSeeQuantities,
  formatPrice,
}: ProductBatchHistoryProps) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(
    batches.length === 1 ? batches[0]?.id : null,
  );

  if (loadingBatches) {
    return (
      <p className="text-center py-8 text-sm text-muted-foreground">
        Loading batches...
      </p>
    );
  }

  if (batches.length === 0) {
    return <NoBatchRecordsFound storeType={storeType} />;
  }

  const formatCost = (amount?: number) => {
    if (amount == null) return "—";
    return formatPrice ? formatPrice(amount) : formatCurrency(amount);
  };

  const toggleExpand = (id: string) => {
    setExpandedBatchId((prev) => (prev === id ? null : id));
  };

  // Matches the real FEFO deduction order (see docs/FIXED_BUGS.md) - only
  // the batch this would actually pick first counts as "sell first".
  const sellFirstBatchId = [...batches]
    .filter(
      (b) =>
        b.is_active !== 0 &&
        b.quantity > 0 &&
        (!b.expiry_date || new Date(b.expiry_date) > new Date()),
    )
    .sort((a, b) => {
      if (!a.expiry_date !== !b.expiry_date) return a.expiry_date ? -1 : 1;
      if (a.expiry_date && b.expiry_date) {
        const diff = new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
        if (diff !== 0) return diff;
      }
      return (
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
    })[0]?.id;

  return (
    <div className="flex flex-col gap-3">
      {batches.map((batch) => {
        let statusColor = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400";
        let statusText = "No expiry";

        if (batch.expiry_date) {
          const days = Math.ceil(
            (new Date(batch.expiry_date).getTime() - new Date().getTime()) /
              (1000 * 60 * 60 * 24),
          );
          statusText = `Expires in ${days} days`;
          if (days <= 0) {
            statusColor = "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400";
            statusText = "Expired";
          } else if (days <= 30) {
            statusColor = "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400";
          } else if (days <= 90) {
            statusColor = "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400";
          }
        }

        const isExpanded = expandedBatchId === batch.id;
        const totalBatchValue =
          canSeeQuantities && batch.cost_price != null && batch.quantity > 0
            ? formatCost(batch.cost_price * batch.quantity)
            : null;

        return (
          <div
            key={batch.id}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={() => toggleExpand(batch.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleExpand(batch.id);
              }
            }}
            className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 cursor-pointer hover:border-border/80 transition-colors"
          >
            <div className="flex justify-between items-start">
              <span className="font-semibold text-[14px]">
                Batch #{batch.batch_number || "Default"}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${statusColor}`}
                >
                  {statusText}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="text-[13px] text-muted-foreground">
              {[
                canSeeQuantities && `${batch.quantity} units`,
                batch.id === sellFirstBatchId && "Sell first (FEFO)",
                batch.cost_price != null && `Cost: ${formatCost(batch.cost_price)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>

            {isExpanded && (
              <div className="pt-3 mt-1 border-t border-border/60 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Cost Price</span>
                  <span className="font-medium">{formatCost(batch.cost_price)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Total Value</span>
                  <span className="font-medium">{totalBatchValue ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Expiry Date</span>
                  <span className="font-medium">
                    {batch.expiry_date ? formatDateToDDMMYYYY(batch.expiry_date) : "No expiry recorded"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Manufacture Date</span>
                  <span className="font-medium">
                    {batch.manufacture_date ? formatDateToDDMMYYYY(batch.manufacture_date) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Location / Shelf</span>
                  <span className="font-medium">{batch.location || "Default Shelf"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Received On</span>
                  <span className="font-medium">
                    {batch.created_at ? formatDateSafe(batch.created_at, "dd/MM/yyyy HH:mm", "—") : "—"}
                  </span>
                </div>
                {batch.supplier_name && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[11px]">Supplier</span>
                    <span className="font-medium">{batch.supplier_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

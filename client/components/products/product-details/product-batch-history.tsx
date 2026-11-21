"use client";

import { useState, useEffect } from "react";
import { Boxes, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import type { StockBatch } from "@/lib/types/stock-batch";
import { formatCurrency } from "@/lib/utils";
import { formatDateSafe, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import { fefoSellOrder } from "@/lib/utils/batch-cost-breakdown";

interface ProductBatchHistoryProps {
  batches: StockBatch[];
  loadingBatches: boolean;
  storeType: string;
  canSeeQuantities: boolean;
  canViewCost: boolean;
  formatPrice?: (amount: number) => string;
  onEditBatch?: (batch: StockBatch) => void;
  highlightBatchId?: string | null;
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
  canViewCost,
  formatPrice,
  onEditBatch,
  highlightBatchId,
}: ProductBatchHistoryProps) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(
    highlightBatchId || (batches.length === 1 ? batches[0]?.id : null),
  );

  useEffect(() => {
    if (highlightBatchId) {
      setExpandedBatchId(highlightBatchId);
      const el = document.getElementById(`batch-card-${highlightBatchId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightBatchId]);

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
    if (amount == null || !canViewCost) return "—";
    return formatPrice ? formatPrice(amount) : formatCurrency(amount);
  };

  const toggleExpand = (id: string) => {
    setExpandedBatchId((prev) => (prev === id ? null : id));
  };

  const sellFirstBatchId = fefoSellOrder(batches)[0]?.id;

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
          canSeeQuantities && canViewCost && batch.cost_price != null && batch.quantity > 0
            ? formatCost(batch.cost_price * batch.quantity)
            : null;

        const isHighlighted = highlightBatchId === batch.id;

        return (
          <div
            key={batch.id}
            id={`batch-card-${batch.id}`}
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
            className={`bg-card border rounded-xl p-4 flex flex-col gap-2 cursor-pointer transition-all ${
              isHighlighted
                ? "border-primary ring-2 ring-primary/30"
                : "border-border hover:border-border/80"
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="font-semibold text-[14px]">
                Batch #{batch.batch_number || "Default"}
              </span>
              <div className="flex items-center gap-2">
                {onEditBatch && (
                  <HintTooltip text="Edit batch">
                    <button
                      type="button"
                      aria-label={`Edit batch ${batch.batch_number || "Default"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditBatch(batch);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </HintTooltip>
                )}
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
                canViewCost && batch.cost_price != null && `Cost: ${formatCost(batch.cost_price)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>

            {isExpanded && (
              <div className="pt-3 mt-1 border-t border-border/60 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {canViewCost && (
                  <>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Cost Price</span>
                      <span className="font-medium">{formatCost(batch.cost_price)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Total Value</span>
                      <span className="font-medium">{totalBatchValue ?? "—"}</span>
                    </div>
                  </>
                )}
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

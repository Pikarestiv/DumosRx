import { Boxes } from "lucide-react";
import type { StockBatch } from "@/lib/types/stock-batch";

interface ProductBatchHistoryProps {
  batches: StockBatch[];
  loadingBatches: boolean;
  storeType: string;
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
}: ProductBatchHistoryProps) {
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
        const days = Math.ceil(
          (new Date(batch.expiry_date || 0).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24),
        );

        let statusColor = "bg-emerald-50 text-emerald-600";
        let statusText = `Expires in ${days} days`;

        if (days <= 0) {
          statusColor = "bg-red-50 text-red-600";
          statusText = "Expired";
        } else if (days <= 30) {
          statusColor = "bg-red-50 text-red-600";
        } else if (days <= 90) {
          statusColor = "bg-orange-50 text-orange-600";
        }

        return (
          <div
            key={batch.id}
            className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2"
          >
            <div className="flex justify-between items-start">
              <span className="font-semibold text-[14px]">
                Batch #{batch.batch_number}
              </span>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${statusColor}`}
              >
                {statusText}
              </span>
            </div>
            <div className="text-[13px] text-muted-foreground">
              {batch.quantity} units
              {batch.id === sellFirstBatchId && " · Sell first (FEFO)"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

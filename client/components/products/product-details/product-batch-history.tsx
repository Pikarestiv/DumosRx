interface ProductBatchHistoryProps {
  batches: any[];
  loadingBatches: boolean;
  storeType: string;
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
    return (
      <p className="text-center py-8 text-sm text-muted-foreground italic">
        No batch records found for this{" "}
        {storeType === "pharmacy" ? "product" : "item"}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {batches.map((batch: any) => {
        const days = Math.ceil(
          (new Date(batch.expiry_date).getTime() - new Date().getTime()) /
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
              {batch.quantity} units · Sell first (FEFO)
            </div>
          </div>
        );
      })}
    </div>
  );
}

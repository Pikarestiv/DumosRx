import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
import type { PurchaseOrder, PurchaseOrderItem } from "@/lib/db/procurement";

function ReceivedProgress({ item }: { item: PurchaseOrderItem }) {
  const ordered = Number(item.bulk_quantity) || 0;
  const received = Number(item.quantity_received) || 0;
  const complete = ordered > 0 && received >= ordered;
  const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;

  return (
    <div className="mt-2 flex items-center gap-2.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-1.5 ${complete ? "bg-emerald-600" : "bg-amber-600"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={`whitespace-nowrap text-[12px] font-medium ${
          complete ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
        }`}
      >
        {complete ? "All received" : `Received ${received} of ${ordered}`}
      </span>
    </div>
  );
}

export function PoLineItems({ po }: { po: PurchaseOrder }) {
  const formatCurrency = useFormatCurrency();
  const capsClass = useUppercaseDisplayClass();
  const items = po.items ?? [];
  const showProgress = po.status === "partially_received" || po.status === "received";

  return (
    <section>
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Line Items · {items.length}
      </h4>
      {items.length > 0 ? (
        items.map((item, idx) => (
          <div key={idx} className="border-b border-border/60 py-3.5">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <div className={`text-[15px] font-semibold text-foreground ${capsClass}`}>
                  {item.product_name || "Unknown Product"}
                </div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {item.bulk_quantity} × {formatCurrency(item.unit_cost || 0)}
                </div>
              </div>
              <div className="shrink-0 text-[15px] font-semibold tabular-nums">
                {formatCurrency(item.subtotal || 0)}
              </div>
            </div>
            {showProgress && <ReceivedProgress item={item} />}
          </div>
        ))
      ) : (
        <div className="mt-3 rounded-lg border border-border/50 bg-muted/50 p-3 text-center text-[13px] italic text-muted-foreground">
          Line items available in full view
        </div>
      )}
      <div className="flex items-baseline justify-between pt-4">
        <span className="text-[16px] font-semibold">Total</span>
        <span className="text-[20px] font-bold tabular-nums">{formatCurrency(po.total_amount)}</span>
      </div>
    </section>
  );
}

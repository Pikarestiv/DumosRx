"use client";

import { useQuery } from "@tanstack/react-query";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getPurchaseOrderItemsForDetail } from "@/lib/db/procurement";
import { queryKeys } from "@/lib/query-keys";
import { Truck } from "lucide-react";
import { DetailRow } from "./detail-row";
import type { PurchaseOrder } from "@/lib/db/procurement";

interface ProcurementDetailsDialogProps {
  po: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30",
  received:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
  cancelled:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30",
};

function NoProcurementItemsFound() {
  return (
    <div className="text-[13px] text-muted-foreground text-center py-4 flex flex-col items-center gap-2">
      <Truck className="w-6 h-6 opacity-30" />
      No items found.
    </div>
  );
}

export function ProcurementDetailsDialog({
  po,
  open,
  onOpenChange,
  currencyCode = "NGN",
}: ProcurementDetailsDialogProps) {
  const itemsQuery = useQuery({
    ...queryKeys.purchaseOrders.detailItems(po?.id ?? null),
    queryFn: () => getPurchaseOrderItemsForDetail(po?.id as string),
    enabled: !!po?.id && open,
  });
  const items = itemsQuery.data ?? [];

  if (!po) return null;

  const statusStyle =
    STATUS_STYLES[(po.status || "").toLowerCase()] ||
    "bg-muted/30 border-border text-foreground";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Purchase order detail"
      className="sm:max-w-lg p-0 gap-0 overflow-hidden"
      headerClassName="px-5 py-4 pt-0 sm:pt-4 border-b border-border m-0"
    >
      <div className="px-5 py-[18px]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <Truck className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate">
              {po.order_number ||
                `PO-${(po.id || "").slice(0, 8).toUpperCase()}`}
            </div>
            <div className="text-[12px] text-muted-foreground/70">
              {formatDateTime(po.order_date || po.created_at)}
            </div>
          </div>
          <div className="text-right shrink-0">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize inline-block border ${statusStyle}`}
            >
              {po.status}
            </span>
            <div className="text-[18px] font-semibold text-primary mt-1">
              {formatCurrency(po.total_amount, currencyCode)}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3.5 flex flex-col gap-3">
          <DetailRow
            label="Expected delivery"
            value={po.due_date ? formatDateTime(po.due_date) : "N/A"}
          />
          {po.ordered_by_name && (
            <DetailRow label="Ordered by" value={po.ordered_by_name} />
          )}
          {po.notes && (
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
                Notes
              </div>
              <div className="text-[13px] text-foreground bg-muted/30 p-3 rounded-md">
                {po.notes}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-2">
              Items ({items.length})
            </div>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-muted/20"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">
                      {item.product_name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unit_price, currencyCode)}
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold shrink-0">
                    {formatCurrency(item.total_price, currencyCode)}
                  </div>
                </div>
              ))}
              {items.length === 0 && itemsQuery.isError && (
                <div className="text-[13px] text-destructive text-center py-4">
                  Failed to load items.
                </div>
              )}
              {items.length === 0 && !itemsQuery.isError && <NoProcurementItemsFound />}
            </div>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}

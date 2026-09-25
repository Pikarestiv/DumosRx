"use client";

import { useQuery } from "@tanstack/react-query";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency } from "@/lib/utils";
import { getProductBasicInfo } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";
import {
  getTypeColor,
  getTypeIcon,
  getTypeIconBg,
  getTypeLabel,
  formatMovementDate,
  formatMovementTime,
} from "@/components/stock-batch/stock-movement-utils";
import { DetailRow } from "./detail-row";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";

interface StockMovementDetailsDialogProps {
  movement: StockMovementHistoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
}

export function StockMovementDetailsDialog({
  movement,
  open,
  onOpenChange,
  currencyCode = "NGN",
}: StockMovementDetailsDialogProps) {
  const productInfoQuery = useQuery({
    ...queryKeys.products.basicInfo(movement?.product_id ?? null),
    queryFn: () => getProductBasicInfo(movement?.product_id as string),
    enabled: !!movement?.product_id && open,
  });
  const productInfo = productInfoQuery.data ?? null;

  if (!movement) return null;

  const date = movement.created_at || movement.movement_date;
  const isPositive = movement.quantity > 0;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Movement detail"
      className="sm:max-w-[440px] p-0 gap-0 overflow-hidden"
      headerClassName="px-5 py-4 pt-0 sm:pt-4 border-b border-border m-0"
    >
      <div className="px-5 py-[18px]">
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getTypeIconBg(movement.movement_type)}`}
          >
            {getTypeIcon(movement.movement_type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate">
              {productInfo
                ? `${productInfo.name}${productInfo.dosage_form ? ` (${productInfo.dosage_form})` : ""}`
                : productInfoQuery.isError
                  ? "Failed to load product"
                  : "Loading..."}
            </div>
            {date && (
              <div className="text-[12px] text-muted-foreground/70">
                {formatMovementDate(date)}, {formatMovementTime(date)}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize inline-block ${getTypeColor(movement.movement_type)}`}
            >
              {getTypeLabel(movement.movement_type)}
            </span>
            <div
              className={`text-[18px] font-semibold mt-1 ${isPositive ? "text-emerald-700" : "text-destructive"}`}
            >
              {isPositive ? "+" : "-"}
              {Math.abs(movement.quantity)}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3.5 flex flex-col gap-3">
          {(movement.total_cost || 0) > 0 && (
            <DetailRow
              label="Total value"
              value={formatCurrency(movement.total_cost || 0, currencyCode)}
            />
          )}
          {movement.reference_id && (
            <DetailRow
              label="Reference"
              value={movement.reference_id}
              valueClassName="break-all"
            />
          )}
          {movement.performed_by_name && (
            <DetailRow label="Performed by" value={movement.performed_by_name} />
          )}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
              Reason / notes
            </div>
            <div className="text-[13px] text-foreground bg-muted/30 p-3 rounded-md">
              {movement.reason || "No additional notes provided."}
            </div>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}

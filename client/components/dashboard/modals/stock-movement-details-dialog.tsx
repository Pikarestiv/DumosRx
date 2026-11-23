"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { toUtcInstant } from "@/lib/utils/date-utils";
import { getProductBasicInfo } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";
import {
  getTypeColor,
  getTypeIcon,
  getTypeIconBg,
  getTypeLabel,
  formatMovementDate,
  formatMovementTime,
  resolveMovementDisplayType,
} from "@/components/stock-batch/stock-movement-utils";
import { DetailRow } from "./detail-row";
import { ProductName } from "@/components/ui/product-name";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";
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
  const router = useRouter();
  const productInfoQuery = useQuery({
    ...queryKeys.products.basicInfo(movement?.product_id ?? null),
    queryFn: () => getProductBasicInfo(movement?.product_id as string),
    enabled: !!movement?.product_id && open,
  });
  const productInfo = productInfoQuery.data ?? null;
  const capsClass = useUppercaseDisplayClass();

  if (!movement) return null;

  const rawDate = movement.created_at || movement.movement_date;
  const date = rawDate ? toUtcInstant(rawDate) : rawDate;
  const isPositive = movement.quantity > 0;
  const displayType = resolveMovementDisplayType(movement);
  const fullProductName = productInfo
    ? `${productInfo.name}${productInfo.dosage_form ? ` (${productInfo.dosage_form})` : ""}`
    : null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Movement detail"
      className="sm:max-w-[440px] p-0 gap-0 overflow-hidden"
      headerClassName="px-5 py-4 pt-0 sm:pt-4 border-b border-border m-0"
      footer={
        <div className="px-5 pb-4 pt-2 flex justify-end border-t border-border bg-background">
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              onOpenChange(false);
              router.push(`/inventory/ledger?selected=${encodeURIComponent(movement.id)}`);
            }}
          >
            View Movement
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      }
    >
      <div className="px-5 py-[18px]">
        <div className="space-y-2.5 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getTypeIconBg(displayType)}`}
              >
                {getTypeIcon(displayType)}
              </div>
              <div className="min-w-0">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize inline-block ${getTypeColor(displayType)}`}
                >
                  {getTypeLabel(displayType)}
                </span>
                {date && (
                  <div className="text-[12px] text-muted-foreground/70 mt-0.5">
                    {formatMovementDate(date)}, {formatMovementTime(date)}
                  </div>
                )}
              </div>
            </div>
            <div
              className={`text-[18px] font-semibold shrink-0 ${isPositive ? "text-emerald-700" : "text-destructive"}`}
            >
              {isPositive ? "+" : "-"}
              {Math.abs(movement.quantity)}
            </div>
          </div>

          <div className="w-full min-w-0">
            {fullProductName ? (
              <ProductName
                name={fullProductName}
                className="text-[15px] font-semibold"
              />
            ) : (
              <div className={`text-[15px] font-semibold truncate w-full ${capsClass}`}>
                {productInfoQuery.isError ? "Failed to load product" : "Loading..."}
              </div>
            )}
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

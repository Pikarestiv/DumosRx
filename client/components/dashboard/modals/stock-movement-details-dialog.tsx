"use client";

import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency } from "@/lib/utils";
import { query } from "@/lib/db";
import {
  getTypeColor,
  getTypeIcon,
  getTypeIconBg,
  formatMovementDate,
  formatMovementTime,
} from "@/components/stock-batch/stock-movement-utils";
import { DetailRow } from "./detail-row";

interface StockMovementDetailsDialogProps {
  movement: any;
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
  const [productInfo, setProductInfo] = useState<any>(null);

  useEffect(() => {
    if (movement?.product_id && open) {
      query<any>(
        "SELECT name, generic_name, dosage_form FROM products WHERE id = ?",
        [movement.product_id],
      ).then((res) => {
        if (res && res[0]) setProductInfo(res[0]);
      });
    } else if (!open) {
      setProductInfo(null);
    }
  }, [movement?.product_id, open]);

  if (!movement) return null;

  const date = movement.created_at || movement.date;
  const isPositive = movement.quantity > 0;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Movement detail"
      className="sm:max-w-[440px] p-0 gap-0 overflow-hidden"
      headerClassName="px-5 py-4 pt-0 border-b border-border m-0"
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
              {movement.movement_type}
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
          {movement.total_cost > 0 && (
            <DetailRow
              label="Total value"
              value={formatCurrency(movement.total_cost, currencyCode)}
            />
          )}
          {movement.reference_id && (
            <DetailRow
              label="Reference"
              value={movement.reference_id}
              valueClassName="break-all"
            />
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

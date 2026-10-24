"use client";

import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type DiscountType = "fixed" | "percentage";

interface POSCartDiscountProps {
  discount: number;
  discountType: DiscountType;
  setDiscount?: (discount: number) => void;
  setDiscountType?: (type: DiscountType) => void;
  showDiscount: boolean;
  setShowDiscount: (show: boolean) => void;
  canApplyDiscounts: boolean;
  currencyCode?: string;
}

export function POSCartDiscount({
  discount,
  discountType,
  setDiscount,
  setDiscountType,
  showDiscount,
  setShowDiscount,
  canApplyDiscounts,
  currencyCode,
}: POSCartDiscountProps) {
  return (
    <>
      {!canApplyDiscounts && discount > 0 && (
        <div className="flex justify-between text-[12.5px] text-muted-foreground">
          <span>Discount</span>
          <span>
            {discountType === "percentage"
              ? `${discount}%`
              : formatCurrency(discount, currencyCode)}
          </span>
        </div>
      )}

      {canApplyDiscounts && (showDiscount || discount > 0) && (
        <div className="flex justify-between text-[12.5px] items-center gap-2">
          <span className="text-muted-foreground">Discount</span>
          <div className="flex gap-1 items-center flex-1 max-w-[160px] justify-end">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={discountType === "percentage" ? 100 : undefined}
              className="flex h-7 w-16 rounded-md border border-input bg-background px-2 py-1 text-xs text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={discount || ""}
              placeholder="0"
              onChange={(e) => {
                const value = parseFloat(e.target.value) || 0;
                setDiscount?.(
                  discountType === "percentage"
                    ? Math.min(100, Math.max(0, value))
                    : Math.max(0, value),
                );
              }}
            />
            <select
              className="flex h-7 rounded-md border border-input bg-background px-1 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={discountType}
              onChange={(e) => {
                // Reset on type switch so a typed ₦50 never silently becomes 50%.
                setDiscountType?.(e.target.value as "fixed" | "percentage");
                setDiscount?.(0);
              }}
            >
              <option value="fixed">Fixed</option>
              <option value="percentage">%</option>
            </select>
            <button
              type="button"
              aria-label="Remove discount"
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => {
                setShowDiscount(false);
                setDiscount?.(0);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {canApplyDiscounts && !(showDiscount || discount > 0) && (
        <div className="flex justify-between text-[12.5px] text-muted-foreground">
          <button
            type="button"
            className="text-primary font-semibold cursor-pointer hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={() => setShowDiscount(true)}
          >
            + Add discount
          </button>
          <span>{formatCurrency(0, currencyCode)}</span>
        </div>
      )}
    </>
  );
}

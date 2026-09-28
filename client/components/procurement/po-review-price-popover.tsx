"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { clampMoneyInput } from "./po-line-item-math";
import { formatCurrency } from "@/lib/utils";

interface POReviewPricePopoverProps {
  costPrice: number;
  sellingPrice: number | string;
  /** The product's live selling price, so the trigger can tell a real
   * repricing apart from the prefill of the price that is already on file.
   * Without it a prefilled row is indistinguishable from an edited one. */
  currentSellingPrice?: number | null;
  onSellingPriceChange: (value: string) => void;
  /** Names the row this popover belongs to, for the dense ledger table where
   * the product name is only visible in another column. */
  productName?: string;
}

/** Per-row "review sell price" action for the Immediate Purchase item
 * table/card list: lets cost and sell price be set in the same pass
 * instead of a separate trip to the Product Catalog. Only ever writes to
 * the draft item's local selling_price field — the actual products.selling_price
 * write happens where createAndReceivePurchaseOrder is called, same as
 * receivePurchaseOrder's existing selling_price handling. */
export function POReviewPricePopover({
  costPrice,
  sellingPrice,
  currentSellingPrice,
  onSellingPriceChange,
  productName,
}: POReviewPricePopoverProps) {
  const margin = useMemo(() => {
    const sell = Number(sellingPrice);
    if (!sell || sell <= 0) return null;
    return ((sell - costPrice) / sell) * 100;
  }, [sellingPrice, costPrice]);

  const isRepriced =
    sellingPrice !== "" &&
    sellingPrice != null &&
    Number(sellingPrice) !== (currentSellingPrice ?? null);
  const isBelowCost = margin !== null && margin <= 0;

  const label = isRepriced ? "Edit price" : "Review price";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={isRepriced ? "secondary" : "outline"}
          size="sm"
          className="h-8 px-2 text-[12px]"
          aria-label={productName ? `${label} for ${productName}` : label}
          title={label}
        >
          <TrendingUp className="w-3.5 h-3.5 mr-1" />
          {isRepriced ? formatCurrency(Number(sellingPrice)) : "Review price"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <div className="text-[12.5px] text-muted-foreground">
          Cost: <span className="font-semibold text-foreground">{formatCurrency(costPrice)}</span>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Sell Price
          </Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={sellingPrice}
            onChange={(e) => onSellingPriceChange(clampMoneyInput(e.target.value))}
            onFocus={(e) => e.target.select()}
            placeholder="0.00"
          />
        </div>
        {margin !== null && (
          <div
            data-testid="po-margin"
            className={
              isBelowCost
                ? "text-[12px] text-destructive font-medium"
                : "text-[12px] text-muted-foreground"
            }
          >
            Margin:{" "}
            <span className={isBelowCost ? "font-semibold" : "font-semibold text-foreground"}>
              {margin.toFixed(2)}%
            </span>
            {isBelowCost && " — below cost"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

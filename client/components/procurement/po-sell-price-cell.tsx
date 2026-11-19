"use client";

import { AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import { getMarginCue, type MarginCue } from "./po-line-item-math";

const CUE_TEXT: Record<MarginCue, string> = {
  below_cost: "At or below cost",
  thinner: "Thinner margin",
};

interface POSellPriceCellProps {
  productName: string;
  sellingPrice?: number | null;
  unitCost: number;
  previousCost?: number | null;
  onEditProduct?: () => void;
  align?: "start" | "end";
}

export function POSellPriceCell({
  productName,
  sellingPrice,
  unitCost,
  previousCost,
  onEditProduct,
  align = "end",
}: POSellPriceCellProps) {
  const formatCurrency = useFormatCurrency();
  const cue = getMarginCue({ unitCost, sellingPrice, previousCost });
  const hasPrice = sellingPrice != null && Number(sellingPrice) > 0;

  return (
    <div className={`flex flex-col gap-0.5 ${align === "end" ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1">
        <span className={hasPrice ? "font-semibold text-foreground" : "text-muted-foreground"}>
          {hasPrice ? formatCurrency(Number(sellingPrice)) : "Not set"}
        </span>
        {onEditProduct && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit selling price for ${productName}`}
            title="Edit product name and price"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
            onClick={onEditProduct}
          >
            <Pencil className="w-3 h-3" />
          </Button>
        )}
      </div>
      {cue && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-3 h-3" aria-hidden />
          {CUE_TEXT[cue]}
        </span>
      )}
    </div>
  );
}

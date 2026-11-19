"use client";

import { useState, type ReactNode, type SyntheticEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { useMediaQuery } from "@/hooks/use-media-query";
import { getStockBatchesForProductDetails } from "@/lib/db/queries/inventory";
import { queryKeys } from "@/lib/query-keys";
import { BatchCostBreakdown } from "./batch-cost-breakdown";
import type { Product } from "../types";

export interface CatalogCostCellProps {
  product: Product;
  canEditCost: boolean;
  canSeeQuantities: boolean;
  formatCurrency: (amount: number) => string;
  onChangeSellingPrice: (product: Product) => void;
}

const keepInside = (e: SyntheticEvent) => e.stopPropagation();

function Contained({ children }: { children: ReactNode }) {
  return (
    <div onClick={keepInside} onKeyDown={keepInside} onContextMenu={keepInside} onPointerDown={keepInside}>
      {children}
    </div>
  );
}

function CostBreakdownPanel({ product, canEditCost, canSeeQuantities, formatCurrency, onChangeSellingPrice }: CatalogCostCellProps & { onChangeSellingPrice: () => void }) {
  const { data: batches, isLoading } = useQuery({
    ...queryKeys.products.batches(product.id),
    queryFn: () => getStockBatchesForProductDetails(product.id),
  });
  if (isLoading || !batches) return <p className="py-4 text-center text-xs text-muted-foreground">Loading batches...</p>;
  return (
    <BatchCostBreakdown
      batches={batches}
      sellingPrice={product.sellingPrice}
      canEdit={canEditCost}
      canSeeQuantities={canSeeQuantities}
      formatPrice={formatCurrency}
      onChangeSellingPrice={onChangeSellingPrice}
    />
  );
}

export function CatalogCostCell(props: CatalogCostCellProps) {
  const { product, formatCurrency } = props;
  const [open, setOpen] = useState(false);
  const isWide = useMediaQuery("(min-width: 768px)");
  const changeSellingPrice = () => {
    setOpen(false);
    props.onChangeSellingPrice(product);
  };
  const title = `Cost of ${product.name}`;
  const costText = product.costPrice > 0 ? formatCurrency(product.costPrice) : "-";
  const trigger = (
    <button
      type="button"
      aria-label={`${costText}: show cost breakdown for ${product.name}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!isWide) setOpen(true);
      }}
      onKeyDown={keepInside}
      className="group/cost -mx-1 rounded-md px-1 py-0.5 text-left text-[13px] font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex items-center gap-1">
        {costText}
        <ChevronDown className="h-3 w-3 opacity-40 group-hover/cost:opacity-100" aria-hidden />
      </span>
      {product.lastBoughtPrice != null && (
        <span className="block text-[10px] font-normal text-muted-foreground/60">
          Last: {formatCurrency(product.lastBoughtPrice)}
        </span>
      )}
    </button>
  );
  const panel = <CostBreakdownPanel {...props} onChangeSellingPrice={changeSellingPrice} />;

  if (!isWide) {
    return (
      <>
        {trigger}
        <ResponsiveModal open={open} onOpenChange={setOpen} title={title}>
          <Contained>{panel}</Contained>
        </ResponsiveModal>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] max-h-[70vh] overflow-y-auto bg-background/95 backdrop-blur-sm">
        <Contained>
          <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
          {panel}
        </Contained>
      </PopoverContent>
    </Popover>
  );
}

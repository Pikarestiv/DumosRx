"use client";

import { useState, type SyntheticEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { getStockBatchesForProductDetails } from "@/lib/db/queries/inventory";
import { queryKeys } from "@/lib/query-keys";
import { CostBreakdownDialog } from "./cost-breakdown-dialog";
import type { Product } from "../types";

export interface CatalogCostCellProps {
  product: Product;
  canEditBatch: boolean;
  canSeeQuantities: boolean;
  formatCurrency: (amount: number) => string;
  onChangeSellingPrice: (product: Product) => void;
}

const keepInside = (e: SyntheticEvent) => e.stopPropagation();

function CostBreakdownLoader({ product, canEditBatch, canSeeQuantities, formatCurrency, onChangeSellingPrice, onClose }: CatalogCostCellProps & { onClose: () => void }) {
  const { data: batches } = useQuery({
    ...queryKeys.products.batches(product.id),
    queryFn: () => getStockBatchesForProductDetails(product.id),
  });
  if (!batches) return null;
  return (
    <div onClick={keepInside} onKeyDown={keepInside} onContextMenu={keepInside} onPointerDown={keepInside}>
      <CostBreakdownDialog
        open
        onOpenChange={(open) => !open && onClose()}
        productName={product.name}
        batches={batches}
        sellingPrice={product.sellingPrice}
        formatPrice={formatCurrency}
        canEdit={canEditBatch}
        canSeeQuantities={canSeeQuantities}
        onChangeSellingPrice={() => onChangeSellingPrice(product)}
      />
    </div>
  );
}

export function CatalogCostCell(props: CatalogCostCellProps) {
  const { product, formatCurrency } = props;
  const [open, setOpen] = useState(false);
  const costText = product.costPrice > 0 ? formatCurrency(product.costPrice) : "-";

  return (
    <>
      <button
        type="button"
        aria-label={`${costText}: show cost breakdown for ${product.name}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
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
      {open && <CostBreakdownLoader {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

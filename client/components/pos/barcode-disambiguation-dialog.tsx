"use client";

import { Barcode, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import type { POSProduct } from "@/lib/types/product";

interface BarcodeDisambiguationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string | null;
  products: POSProduct[];
  onSelectProduct: (product: POSProduct) => void;
  currencyCode?: string;
}

export function BarcodeDisambiguationDialog({
  open,
  onOpenChange,
  barcode,
  products,
  onSelectProduct,
  currencyCode,
}: BarcodeDisambiguationDialogProps) {
  const displayName = useDisplayName();

  const handleSelect = (product: POSProduct) => {
    onSelectProduct(product);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
        <DialogHeader className="text-left space-y-1.5">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wide uppercase">
            <Barcode className="w-3.5 h-3.5" />
            Barcode Disambiguation
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            Select Product
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Barcode <span className="font-mono font-semibold text-foreground">{barcode}</span> matches multiple products. Which item do you want to add to cart?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2 max-h-[320px] overflow-y-auto stable-scrollbar">
          {products.map((product) => {
            const inStock = product.stock ?? 0;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(product)}
                className="w-full flex items-center justify-between gap-3 p-3 text-left rounded-2xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-colors group outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                    {displayName(product.name)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{product.category_name || "General"}</span>
                    <span>·</span>
                    <span className={inStock <= 0 ? "text-destructive font-medium" : ""}>
                      {inStock} in stock
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-sm text-foreground">
                    {formatCurrency(product.unit_price, currencyCode)}
                  </span>
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/context/store-context";

import { useProductDetails, Product } from "./product-details/use-product-details";
import { ProductBasicInfo } from "./product-details/product-basic-info";
import { ProductSupplierInfo } from "./product-details/product-supplier-info";
import { ProductPricingInfo } from "./product-details/product-pricing-info";
import { ProductStockInfo } from "./product-details/product-stock-info";
import { ProductBatchHistory } from "./product-details/product-batch-history";

interface ProductDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

export function ProductDetailsDialog({
  open,
  onOpenChange,
  product,
}: ProductDetailsDialogProps) {
  const { storeProfile } = useStore();
  const {
    batches,
    loadingBatches,
    formatPrice,
    formatDate,
    getStatusBadge,
    expiryWarningDays,
    profitMargin,
    daysToExpiry,
  } = useProductDetails(product, storeProfile);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-left font-serif font-bold text-2xl">
                {product.name}
              </DialogTitle>
              <DialogDescription className="text-left text-lg">
                {product.genericName}
              </DialogDescription>
            </div>
            {getStatusBadge(product.status)}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProductBasicInfo product={product} />
          
          <ProductSupplierInfo product={product} />
          
          <ProductPricingInfo
            product={product}
            formatPrice={formatPrice}
            profitMargin={profitMargin}
          />
          
          <ProductStockInfo
            product={product}
            formatDate={formatDate}
            daysToExpiry={daysToExpiry}
            expiryWarningDays={expiryWarningDays}
          />
        </div>

        <ProductBatchHistory
          batches={batches}
          loadingBatches={loadingBatches}
          storeType={storeProfile?.store_type || "pharmacy"}
        />
      </DialogContent>
    </Dialog>
  );
}

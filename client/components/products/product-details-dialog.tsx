"use client";

import { ResponsiveModal } from "@/components/ui/responsive-modal";
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
    <ResponsiveModal 
      open={open} 
      onOpenChange={onOpenChange} 
      title={
        <span className="flex items-center justify-between w-full">
          <span>{product.name}</span>
          <span className="ml-4">{getStatusBadge(product.status)}</span>
        </span>
      } 
      description={<>{product.genericName}</>} 
      className="sm:max-w-5xl max-h-[90vh] overflow-y-auto"
    >

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
      </ResponsiveModal>
  );
}

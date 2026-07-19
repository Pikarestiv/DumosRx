import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/context/store-context";
import { useProductDetails, Product } from "./product-details/use-product-details";
import { ProductBasicInfo } from "./product-details/product-basic-info";
import { ProductSupplierInfo } from "./product-details/product-supplier-info";
import { ProductPricingInfo } from "./product-details/product-pricing-info";
import { ProductStockInfo } from "./product-details/product-stock-info";
import { ProductBatchHistory } from "./product-details/product-batch-history";
import { ProductHistory } from "./product-details/product-history";

interface CatalogDetailPanelProps {
  product: Product | null;
  onEditProduct: (product: Product) => void;
}

export function CatalogDetailPanel({ product, onEditProduct }: CatalogDetailPanelProps) {
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

  if (!product) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
        <p className="text-sm">Select a product from the list to view its details, batches, and history.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-card rounded-2xl">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{product.name}</h2>
          <p className="text-sm text-muted-foreground">{product.genericName || product.barcode || product.id.slice(0,8)}</p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(product.status)}
          <button 
            onClick={() => onEditProduct(product)}
            className="text-[12.5px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full mb-4 grid grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-0">
            <div className="flex flex-col gap-4 pb-4">
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
          </TabsContent>

          <TabsContent value="batches" className="mt-0">
            <ProductBatchHistory
              batches={batches}
              loadingBatches={loadingBatches}
              storeType={storeProfile?.store_type || "pharmacy"}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-4 pt-2">
            <ProductHistory productId={product.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

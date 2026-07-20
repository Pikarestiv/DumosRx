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
      <div className="flex flex-col h-full min-h-0 bg-card border border-border rounded-2xl items-center justify-center text-muted-foreground p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-muted-foreground/50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <h3 className="text-[15px] font-semibold text-foreground mb-1">No product selected</h3>
        <p className="text-[13px] max-w-[260px]">Select a product from the list to view its details, batches, and history.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-card border border-border rounded-2xl">
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

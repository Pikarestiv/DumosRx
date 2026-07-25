import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Edit } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { cn } from "@/lib/utils";
import {
  useProductDetails,
  Product,
} from "./product-details/use-product-details";
import { ProductBasicInfo } from "./product-details/product-basic-info";
import { ProductSupplierInfo } from "./product-details/product-supplier-info";
import { ProductPricingInfo } from "./product-details/product-pricing-info";
import { ProductStockInfo } from "./product-details/product-stock-info";
import { ProductBatchHistory } from "./product-details/product-batch-history";
import { ProductHistory } from "./product-details/product-history";

interface CatalogDetailPanelProps {
  product: Product | null;
  onEditProduct: (product: Product) => void;
  onClose?: () => void;
  className?: string;
}

export function CatalogDetailPanel({
  product,
  onEditProduct,
  onClose,
  className,
}: CatalogDetailPanelProps) {
  const { storeProfile } = useStore();
  const {
    batches,
    loadingBatches,
    formatPrice,
    formatDate,
    // getStatusBadge,
    expiryWarningDays,
    profitMargin,
    daysToExpiry,
  } = useProductDetails(product, storeProfile);

  if (!product) {
    return (
      <div
        className={cn(
          "flex flex-col h-full min-h-0 bg-card border border-border rounded-2xl items-center justify-center text-muted-foreground p-6 text-center",
          className,
        )}
      >
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
        <h3 className="text-[15px] font-semibold text-foreground mb-1">
          No product selected
        </h3>
        <p className="text-[13px] max-w-[260px]">
          Select a product from the list to view its details, batches, and
          history.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 bg-card border border-border rounded-2xl",
        className,
      )}
    >
      {/* Header */}
      <div className="p-4 shrink-0 flex flex-col gap-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <button
              onClick={onClose}
              className="mt-1 w-8 h-8 shrink-0 rounded-2xl bg-muted/50 flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="flex flex-col items-start justify-start">
              <div className="flex flex-col">
                <h2 className="text-[17px] font-bold text-foreground leading-tight">
                  {product.name}
                </h2>
                <p className="text-[12px] text-muted-foreground mt-0.5 uppercase tracking-wide">
                  SKU: {product.barcode || product.id.slice(0, 8)}
                </p>
              </div>

              {/* Category below border */}
              <span className="text-[11px] font-semibold text-primary px-2 py-0.5 shrink-0 bg-primary/5 rounded-md mt-2">
                {product.category || "Pharmacy"}
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-8 h-8 rounded-2xl bg-muted/50 flex items-center justify-center hover:bg-muted/80 transition-colors">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => onEditProduct(product)}
                className="cursor-pointer"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Product
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0">
        {/* Fixed tab header — stays in place while tab content scrolls */}
        <div className="shrink-0 bg-primary/5 border-b border-border px-4 py-3">
          <TabsList className="w-full flex justify-between bg-transparent border-none !shadow-none p-0 h-auto space-x-2">
            <TabsTrigger
              value="details"
              className="flex-1 py-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground shadow-none"
            >
              Details
            </TabsTrigger>
            <TabsTrigger
              value="batches"
              className="flex-1 py-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground shadow-none"
            >
              Batches
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1 py-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground shadow-none"
            >
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
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
        </div>
      </Tabs>
    </div>
  );
}

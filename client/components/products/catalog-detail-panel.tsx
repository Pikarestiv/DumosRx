import React, { useState } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Edit, Barcode, Trash2 } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { BarcodePrintDialog } from "@/components/stock-batch/barcode-print-dialog";
import { ProductDeleteDialog } from "./product-delete-dialog";
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
import { ProductDetailTabNav } from "./product-detail-tab-nav";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";

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
  const { canManageStockBatch } = useAuth();
  const canPrintLabels = useHasPermission("print_product_labels");
  const canDeleteProducts = useHasPermission("delete_products");
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const capsClass = useUppercaseDisplayClass();
  const {
    batches,
    loadingBatches,
    creator,
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
                <h2 className={`text-[17px] font-bold text-foreground leading-tight ${capsClass}`}>
                  {product.name}
                </h2>
                <p className="text-[12px] text-muted-foreground mt-0.5 uppercase tracking-wide">
                  SKU: {product.id.slice(0, 8).toUpperCase()}
                </p>
              </div>

              {/* Category below border */}
              <span className={`text-[11px] font-semibold text-primary px-2 py-0.5 shrink-0 bg-primary/5 rounded-md mt-2 ${capsClass}`}>
                {product.category || "Pharmacy"}
              </span>
            </div>
          </div>

          {(canManageStockBatch || canPrintLabels || canDeleteProducts) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Product actions"
                  className="w-8 h-8 rounded-2xl bg-muted/50 flex items-center justify-center hover:bg-muted/80 transition-colors"
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
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canManageStockBatch && (
                  <DropdownMenuItem
                    onClick={() => onEditProduct(product)}
                    className="cursor-pointer"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Product
                  </DropdownMenuItem>
                )}
                {canPrintLabels && (
                  <DropdownMenuItem
                    onClick={() => setIsLabelDialogOpen(true)}
                    className="cursor-pointer"
                  >
                    <Barcode className="w-4 h-4 mr-2" />
                    Print Labels
                  </DropdownMenuItem>
                )}
                {canDeleteProducts && (
                  <DropdownMenuItem
                    onClick={() =>
                      setDeleteTarget({ id: product.id, name: product.name })
                    }
                    variant="destructive"
                    className="cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Product
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0">
        {/* Fixed tab header, stays in place while tab content scrolls */}
        <div className="shrink-0 bg-primary/5 border-b border-border px-4 py-3">
          <ProductDetailTabNav />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="details" className="mt-0">
            <div className="flex flex-col gap-4 pb-4">
              <ProductBasicInfo product={product} creator={creator} formatDate={formatDate} />
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

      <BarcodePrintDialog
        isOpen={isLabelDialogOpen}
        onClose={() => setIsLabelDialogOpen(false)}
        product={{
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          unit_price: product.sellingPrice,
        }}
      />

      <ProductDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSuccess={() => {
          setDeleteTarget(null);
          onClose?.();
        }}
      />
    </div>
  );
}

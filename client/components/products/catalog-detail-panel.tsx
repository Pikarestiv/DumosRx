"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Edit, Barcode, Trash2, ArrowLeft, MoreVertical } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useStockVisibility } from "@/lib/hooks/use-stock-visibility";
import { BarcodePrintDialog } from "@/components/stock-batch/barcode-print-dialog";
import { ProductDeleteDialog } from "./product-delete-dialog";
import { cn } from "@/lib/utils";
import {
  useProductDetails,
  Product,
} from "./product-details/use-product-details";
import { ProductOverviewCards } from "./product-details/product-overview-cards";
import { ProductBatchHistory } from "./product-details/product-batch-history";
import { ProductHistory } from "./product-details/product-history";
import { ProductImageSection } from "./product-details/product-image-section";
import { ProductDetailTabNav } from "./product-detail-tab-nav";
import { CostBreakdownDialog } from "./batch-cost/cost-breakdown-dialog";
import type { StockBatch } from "@/lib/types/stock-batch";
import { useUppercaseDisplayClass } from "@/lib/hooks/use-uppercase-display";

interface CatalogDetailPanelProps {
  product: Product | null;
  onEditProduct: (product: Product) => void;
  onClose?: () => void;
  className?: string;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  highlightBatchId?: string | null;
}

export function CatalogDetailPanel({
  product,
  onEditProduct,
  onClose,
  className,
  activeTab,
  onTabChange,
  highlightBatchId,
}: CatalogDetailPanelProps) {
  const router = useRouter();
  const { storeProfile } = useStore();
  const { canManageStockBatch } = useAuth();
  const canPrintLabels = useHasPermission("print_product_labels");
  const canDeleteProducts = useHasPermission("delete_products");
  const canViewCost = useHasPermission("view_cost_fields");
  const canEditBatch = useHasPermission("edit_batch_details");
  const { canSeeQuantities } = useStockVisibility();

  const [internalTab, setInternalTab] = useState("details");
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [batchDialog, setBatchDialog] = useState<{ open: boolean; batchId: string | null }>({ open: false, batchId: null });
  const openBatchEditor = (batch?: StockBatch) => setBatchDialog({ open: true, batchId: batch?.id ?? null });
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const capsClass = useUppercaseDisplayClass();

  const currentTab = activeTab ?? internalTab;
  const handleTabChange = onTabChange ?? setInternalTab;

  const {
    batches,
    loadingBatches,
    creator,
    formatPrice,
  } = useProductDetails(product, storeProfile);

  if (!product) {
    return (
      <div
        className={cn(
          "flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl items-center justify-center text-muted-foreground p-6 text-center",
          className,
        )}
      >
        <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
          <Barcode className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-[15px] font-semibold text-foreground mb-1">
          No product selected
        </h3>
        <p className="text-[13px] max-w-[260px]">
          Select a product from the list to view its details, batches, and movements.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden",
        className,
      )}
    >
      {/* Top Header */}
      <div className="p-4 pb-2 shrink-0 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <button
              onClick={onClose}
              aria-label="Back"
              className="mt-0.5 w-8 h-8 shrink-0 rounded-full border border-border/60 bg-muted/40 flex items-center justify-center hover:bg-muted/80 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
            <div className="min-w-0">
              <h2 className={`text-lg font-bold text-foreground leading-snug truncate ${capsClass}`}>
                {product.name}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[11px] font-semibold text-primary px-2 py-0.5 shrink-0 bg-primary/10 rounded-md ${capsClass}`}>
                  {product.category || "General"}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  Barcode {product.barcode || "Not set"}
                </span>
              </div>
            </div>
          </div>

          {(canManageStockBatch || canPrintLabels || canDeleteProducts) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Product actions"
                  className="w-8 h-8 shrink-0 rounded-full border border-border/60 bg-muted/40 flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
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

        {/* Action Buttons Row */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            onClick={() => onEditProduct(product)}
            className="bg-primary text-primary-foreground font-semibold rounded-xl text-xs h-9 hover:bg-primary/90"
          >
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/inventory/batches?action=adjust&productId=${product.id}`)}
            className="rounded-xl text-xs h-9 font-medium border-border"
          >
            Adjust stock
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/procurement/new?productId=${product.id}`)}
            className="rounded-xl text-xs h-9 font-medium border-border"
          >
            Add to order
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="shrink-0 px-4 pt-1">
          <ProductDetailTabNav batchCount={batches.length} />
        </div>

        <div className="flex-1 overflow-y-auto stable-scrollbar p-4">
          <TabsContent value="details" className="mt-0 space-y-4">
            <ProductOverviewCards
              product={product}
              batches={batches}
              creator={creator}
              formatPrice={formatPrice}
              onOpenCostBreakdown={() => setBatchDialog({ open: true, batchId: null })}
              onEditProduct={onEditProduct}
              canViewCost={canViewCost}
              onEditBatch={canEditBatch ? openBatchEditor : undefined}
            />
            <div className="pt-2">
              <ProductImageSection
                productId={product.id}
                productName={product.name}
                imageKey={product.imageKey}
                categoryName={product.category}
              />
            </div>
          </TabsContent>

          <TabsContent value="batches" className="mt-0">
            <ProductBatchHistory
              batches={batches}
              loadingBatches={loadingBatches}
              storeType={storeProfile?.store_type || "pharmacy"}
              canSeeQuantities={canSeeQuantities}
              canViewCost={canViewCost}
              formatPrice={formatPrice}
              onEditBatch={canEditBatch ? openBatchEditor : undefined}
              highlightBatchId={highlightBatchId}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-2">
            <ProductHistory productId={product.id} />
          </TabsContent>
        </div>
      </Tabs>

      {batchDialog.open && (
        <CostBreakdownDialog
          key={batchDialog.batchId ?? "view"}
          open
          onOpenChange={(open) => !open && setBatchDialog({ open: false, batchId: null })}
          productName={product.name}
          batches={batches}
          sellingPrice={product.sellingPrice}
          formatPrice={formatPrice}
          canEdit={canEditBatch}
          canViewCost={canViewCost}
          canSeeQuantities={canSeeQuantities}
          initialEditBatchId={batchDialog.batchId}
          onChangeSellingPrice={() => onEditProduct(product)}
        />
      )}

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

import { useState } from "react";
import { Barcode, ChevronDown, MoreHorizontal, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useImportExportActions } from "@/components/stock-batch/import-export-actions";
import { useBulkShowOnlineActions } from "./bulk-show-online-actions";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { BarcodeBulkPrintDialog } from "@/components/stock-batch/barcode-bulk-print-dialog";
import type { Product } from "./types";

interface ProductActionsMenuProps {
  onManageCategories: () => void;
  onProductsChanged: () => void;
  filteredProductIds?: string[];
  labelProducts?: Product[];
}

export function ProductActionsMenu({ onManageCategories, onProductsChanged, filteredProductIds, labelProducts }: ProductActionsMenuProps) {
  const { canManageStockBatch } = useAuth();
  const { storeProfile } = useStore();
  const canPrintLabels = useHasPermission("print_product_labels");
  const [showLabels, setShowLabels] = useState(false);
  const importExport = useImportExportActions({ onImported: onProductsChanged, filteredProductIds });
  const bulkOnline = useBulkShowOnlineActions({ onUpdated: onProductsChanged, filteredProductIds });
  const hasOnlineStore = storeProfile?.online_store_enabled === 1;

  if (!canManageStockBatch && !(canPrintLabels && labelProducts)) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 text-[12px] sm:h-9" aria-label="Product actions">
            <span className="hidden sm:inline">Product actions</span>
            <MoreHorizontal className="h-4 w-4 sm:hidden" />
            <ChevronDown className="hidden h-3.5 w-3.5 sm:inline" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canPrintLabels && labelProducts && (
            <DropdownMenuItem onSelect={() => setShowLabels(true)}>
              <Barcode className="h-3.5 w-3.5" />
              Print barcode labels
            </DropdownMenuItem>
          )}
          {canManageStockBatch && (
            <>
              {importExport.menuItems}
              {hasOnlineStore && bulkOnline.menuItems}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onManageCategories}>
                <Settings2 className="h-3.5 w-3.5" />
                Manage categories
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canManageStockBatch && (
        <>
          {importExport.overlays}
          {hasOnlineStore && bulkOnline.overlays}
        </>
      )}
      {showLabels && labelProducts && (
        <BarcodeBulkPrintDialog
          isOpen
          onClose={() => setShowLabels(false)}
          products={labelProducts.map((p) => ({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
            unit_price: p.sellingPrice,
          }))}
        />
      )}
    </>
  );
}

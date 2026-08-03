"use client";

import { useState, useEffect } from "react";
import { Plus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductCombobox, SelectedProduct } from "@/components/ui/product-combobox";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import type { Product, ProductViewModel } from "@/lib/types/product";
import type { DraftPOLineItem } from "@/lib/db/procurement";

interface POAddItemFormProps {
  products: Product[];
  onAddItem: (item: DraftPOLineItem) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId?: string | null;
  onNewlyCreatedProductConsumed?: () => void;
}

export function POAddItemForm({
  products,
  onAddItem,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
}: POAddItemFormProps) {
  const { t } = useStore();

  const [currentProductId, setCurrentProductId] = useState("");
  const [currentProductName, setCurrentProductName] = useState("");
  const [currentSelectedProduct, setCurrentSelectedProduct] = useState<SelectedProduct | null>(null);
  const [currentBulkQty, setCurrentBulkQty] = useState<number | "">("");
  const [currentCost, setCurrentCost] = useState<number | "">("");

  const selectedProduct = products.find((m) => m.id === currentProductId);
  // Always sourced live from the product's own Packaging & Units setting — never a
  // per-order snapshot — so it can't go stale if the product is edited later.
  const unitsPerBulk = selectedProduct?.units_per_bulk || 1;

  // Automatically select the product if it's created externally and its ID is passed down
  useEffect(() => {
    if (newlyCreatedProductId && products.length > 0) {
      const newlyAddedProduct = products.find(
        (p) => p.id === newlyCreatedProductId
      );
      if (newlyAddedProduct) {
        setCurrentProductId(newlyAddedProduct.id);
        setCurrentProductName(newlyAddedProduct.name);
        setCurrentCost(
          newlyAddedProduct.cost_price
            ? newlyAddedProduct.cost_price * (newlyAddedProduct.units_per_bulk || 1)
            : ""
        );
        onNewlyCreatedProductConsumed?.();
      }
    }
  }, [products, newlyCreatedProductId, onNewlyCreatedProductConsumed]);

  const handleProductChange = (option: SelectedProduct) => {
    setCurrentProductName(option.name);
    setCurrentSelectedProduct(option);
    if (option.source === "local" && option.localId) {
      setCurrentProductId(option.localId);
      const product = products.find((m) => m.id === option.localId);
      if (product) {
        setCurrentCost(
          product.cost_price ? product.cost_price * (product.units_per_bulk || 1) : ""
        );
      }
    } else {
      setCurrentProductId("");
      setCurrentCost("");
    }
  };

  const handleAddLineItem = () => {
    if (!currentProductId) {
      if (currentSelectedProduct) {
        // Trigger quick add product instead of error
        onOpenAddProduct({
          name: currentSelectedProduct.name,
          genericName: currentSelectedProduct.generic_name,
          manufacturer: currentSelectedProduct.manufacturer,
          strength: currentSelectedProduct.strength,
          dosageForm: currentSelectedProduct.dosageForm,
        });
      } else if (currentProductName) {
        onOpenAddProduct({ name: currentProductName });
      } else {
        toast.error("Please select a product");
      }
      return;
    }

    const product = products.find((m) => m.id === currentProductId);
    if (!product) return;

    const qty = Number(currentBulkQty) || 1;
    const uom = product.units_per_bulk || 1;
    const cost = Number(currentCost) || 0;

    const newItem = {
      product_id: currentProductId,
      product_name: product.name,
      bulk_unit: product.bulk_unit || "Carton",
      bulk_quantity: qty,
      units_per_bulk: uom,
      unit_cost: cost,
      subtotal: qty * cost,
    };

    onAddItem(newItem);

    // Reset item state
    setCurrentProductId("");
    setCurrentProductName("");
    setCurrentSelectedProduct(null);
    setCurrentBulkQty("");
    setCurrentCost("");
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          {t("product")}
        </Label>
        <ProductCombobox
          value={currentProductName}
          onChange={handleProductChange}
          placeholder="e.g. Amoxicillin 500mg"
          className="bg-muted border-border h-10 px-3 text-[13px] rounded-[10px]"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 sm:items-end">
        <div className="space-y-1">
          <Label className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            Qty ({selectedProduct?.bulk_unit || "Bulk"})
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    How many bulk units (e.g. Cartons) you&apos;re ordering — not
                    individual base units.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Input
            type="number"
            className="bg-card border-border h-10 px-3 text-[13px] rounded-[10px]"
            value={currentBulkQty}
            min={1}
            onChange={(e) => setCurrentBulkQty(e.target.value === "" ? "" : Number(e.target.value))}
            onFocus={(e) => e.target.select()}
            placeholder="Qty"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] font-semibold text-primary uppercase tracking-wide flex items-center gap-1">
            Bulk Cost ({selectedProduct?.bulk_unit || "Unit"})
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    The cost of one {(selectedProduct?.bulk_unit || "bulk unit").toLowerCase()}{" "}
                    (e.g. one Carton), not the price per individual base unit.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Input
            type="number"
            className="bg-card border-border h-10 px-3 text-[13px] rounded-[10px]"
            value={currentCost}
            min={0}
            onChange={(e) => setCurrentCost(e.target.value === "" ? "" : Number(e.target.value))}
            onFocus={(e) => e.target.select()}
            placeholder="0.00"
          />
        </div>
        <div>
          <Button
            type="button"
            onClick={handleAddLineItem}
            className="w-full sm:w-auto h-10 px-4 text-[13px] font-semibold rounded-[10px] shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add
          </Button>
        </div>
      </div>
      {selectedProduct && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          Conversion: 1 {selectedProduct.bulk_unit || "Bulk"} = {unitsPerBulk}{" "}
          {selectedProduct.base_unit || "unit"}(s)
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 opacity-50 cursor-pointer" />
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Pulled from the product&apos;s Packaging &amp; Units setting — to
                  change it, edit the product, not this order.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </p>
      )}
    </div>
  );
}

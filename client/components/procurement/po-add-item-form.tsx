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
import type { Product } from "@/lib/types/product";

interface POAddItemFormProps {
  products: Product[];
  onAddItem: (item: any) => void;
  onOpenAddProduct: (productData: any) => void;
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
  const [currentUoM, setCurrentUoM] = useState<number | "">("");
  const [currentCost, setCurrentCost] = useState<number | "">("");

  // Automatically select the product if it's created externally and its ID is passed down
  useEffect(() => {
    if (newlyCreatedProductId && products.length > 0) {
      const newlyAddedProduct = products.find(
        (p) => p.id === newlyCreatedProductId
      );
      if (newlyAddedProduct) {
        setCurrentProductId(newlyAddedProduct.id);
        setCurrentProductName(newlyAddedProduct.name);
        setCurrentUoM(newlyAddedProduct.units_per_bulk || 1);
        setCurrentCost(
          (newlyAddedProduct.cost_price || 0) * (newlyAddedProduct.units_per_bulk || 1)
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
        setCurrentUoM(product.units_per_bulk || 1);
        setCurrentCost((product.cost_price || 0) * (product.units_per_bulk || 1));
      }
    } else {
      setCurrentProductId("");
      setCurrentUoM("");
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
          brand: currentSelectedProduct.brand_name,
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
    const uom = Number(currentUoM) || 1;
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
    setCurrentUoM("");
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
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            Qty ({products.find((m) => m.id === currentProductId)?.bulk_unit || "Bulk"})
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
            placeholder="Qty"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            Conversion
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Number of base units (e.g. Tablets) inside one bulk unit (e.g.
                    Carton) — received stock is converted to base units automatically.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Input
            type="number"
            className="bg-card border-border h-10 px-3 text-[13px] rounded-[10px]"
            value={currentUoM}
            min={1}
            onChange={(e) => setCurrentUoM(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="E.g. 20"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] font-semibold text-primary uppercase tracking-wide">
            Bulk Cost ({products.find((m) => m.id === currentProductId)?.bulk_unit || "Unit"})
          </Label>
          <Input
            type="number"
            className="bg-card border-border h-10 px-3 text-[13px] rounded-[10px]"
            value={currentCost}
            min={0}
            onChange={(e) => setCurrentCost(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="0.00"
          />
        </div>
        <div>
          <Button
            type="button"
            onClick={handleAddLineItem}
            className="h-10 px-4 text-[13px] font-semibold rounded-[10px] shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

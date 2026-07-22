"use client";

import { useState } from "react";
import { Plus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProductCombobox } from "@/components/ui/product-combobox";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";

interface Product {
  id: string;
  name: string;
  bulk_unit: string;
  base_unit: string;
  units_per_bulk: number;
  cost_price: number;
}

interface POAddItemFormProps {
  products: Product[];
  onAddItem: (item: any) => void;
  onOpenAddProduct: (initialName: string) => void;
}

export function POAddItemForm({ products, onAddItem, onOpenAddProduct }: POAddItemFormProps) {
  const { t } = useStore();

  const [currentProductId, setCurrentProductId] = useState("");
  const [currentProductName, setCurrentProductName] = useState("");
  const [currentBulkQty, setCurrentBulkQty] = useState(1);
  const [currentUoM, setCurrentUoM] = useState(1);
  const [currentCost, setCurrentCost] = useState(0);

  const handleProductChange = (option: any) => {
    setCurrentProductName(option.name);
    if (option.source === "local" && option.localId) {
      setCurrentProductId(option.localId);
      const product = products.find((m) => m.id === option.localId);
      if (product) {
        setCurrentUoM(product.units_per_bulk || 1);
        setCurrentCost(product.cost_price * (product.units_per_bulk || 1));
      }
    } else {
      setCurrentProductId("");
      setCurrentUoM(1);
      setCurrentCost(0);
    }
  };

  const handleAddLineItem = () => {
    if (!currentProductId) {
      if (currentProductName) {
        // Trigger quick add product instead of error
        onOpenAddProduct(currentProductName);
      } else {
        toast.error("Please select a product");
      }
      return;
    }

    const product = products.find((m) => m.id === currentProductId);
    if (!product) return;

    const newItem = {
      product_id: currentProductId,
      product_name: product.name,
      bulk_unit: product.bulk_unit || "Carton",
      bulk_quantity: currentBulkQty,
      units_per_bulk: currentUoM,
      unit_cost: currentCost,
      subtotal: currentBulkQty * currentCost,
    };

    onAddItem(newItem);

    // Reset item state
    setCurrentProductId("");
    setCurrentProductName("");
    setCurrentBulkQty(1);
    setCurrentUoM(1);
    setCurrentCost(0);
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
          <Label className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
            Qty (Bulk)
          </Label>
          <Input
            type="number"
            className="bg-card border-border h-10 px-3 text-[13px] rounded-[10px]"
            value={currentBulkQty}
            min={1}
            onChange={(e) => setCurrentBulkQty(Number(e.target.value))}
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
                  <p>Number of base units inside one bulk unit</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Input
            type="number"
            className="bg-card border-border h-10 px-3 text-[13px] rounded-[10px]"
            value={currentUoM}
            min={1}
            onChange={(e) => setCurrentUoM(Number(e.target.value))}
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
            onChange={(e) => setCurrentCost(Number(e.target.value))}
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

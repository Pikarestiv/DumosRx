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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
          {t("product")}
        </Label>
        <ProductCombobox
          value={currentProductName}
          onChange={handleProductChange}
          placeholder="Search product..."
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-3 space-y-2">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">
            Qty (Bulk)
          </Label>
          <Input
            type="number"
            className="bg-card border-accent/10 h-10"
            value={currentBulkQty}
            onChange={(e) => setCurrentBulkQty(Number(e.target.value))}
          />
        </div>
        <div className="md:col-span-3 space-y-2">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
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
            className="bg-card border-accent/10 h-10"
            value={currentUoM}
            onChange={(e) => setCurrentUoM(Number(e.target.value))}
            placeholder="E.g. 20"
          />
        </div>
        <div className="md:col-span-4 space-y-2">
          <Label className="text-[10px] uppercase font-bold text-primary">
            Bulk Cost (
            {products.find((m) => m.id === currentProductId)?.bulk_unit || "Unit"}
            )
          </Label>
          <Input
            type="number"
            className="bg-card border-accent/10 h-10"
            value={currentCost}
            onChange={(e) => setCurrentCost(Number(e.target.value))}
          />
        </div>
        <div className="md:col-span-2">
          <Button
            type="button"
            onClick={handleAddLineItem}
            className="w-full h-10 px-0"
          >
            <Plus className="w-5 h-5" /> Add
          </Button>
        </div>
      </div>
    </div>
  );
}

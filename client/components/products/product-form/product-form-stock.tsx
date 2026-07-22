import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Info, ScanLine } from "lucide-react";
import type { Product } from "../types";

interface ProductFormStockProps {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  onOpenScanner: () => void;
}

export function ProductFormStock({
  formData,
  onInputChange,
  onOpenScanner,
}: ProductFormStockProps) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="reorderLevel">Reorder Level</Label>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild type="button">
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  You will be alerted when stock falls to or below this number, reminding you to restock.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="reorderLevel"
          type="number"
          value={formData.reorderLevel === 0 ? "" : formData.reorderLevel}
          onChange={(e) =>
            onInputChange("reorderLevel", parseInt(e.target.value) || 0)
          }
          onFocus={(e) => e.target.select()}
          placeholder="0"
          min="0"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="barcode">Barcode (Optional)</Label>
        <div className="flex gap-2">
          <Input
            id="barcode"
            value={formData.barcode}
            onChange={(e) => onInputChange("barcode", e.target.value)}
            placeholder="Scan or type barcode"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={onOpenScanner}
            title="Scan Barcode"
          >
            <ScanLine className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-2">
          <Label htmlFor="showOnline">Show in Public Storefront</Label>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild type="button">
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Enable this to display the product on your online pharmacy storefront.
                  Note: This feature may be restricted on some subscription plans.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="showOnline"
            checked={formData.showOnline}
            onCheckedChange={(checked) => onInputChange("showOnline", checked)}
          />
          <span className="text-sm text-muted-foreground">
            {formData.showOnline ? "Visible online" : "Hidden"}
          </span>
        </div>
      </div>
    </>
  );
}

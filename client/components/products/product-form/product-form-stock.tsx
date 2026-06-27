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
          <Label htmlFor="stockQuantity">Stock Quantity</Label>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild type="button">
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  The current number of units you have physically available in the store.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="stockQuantity"
          type="number"
          value={formData.stockQuantity === 0 ? "" : formData.stockQuantity}
          onChange={(e) =>
            onInputChange("stockQuantity", parseInt(e.target.value) || 0)
          }
          onFocus={(e) => e.target.select()}
          placeholder="0"
          min="0"
        />
      </div>

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
        <Label htmlFor="expiryDate">Expiry Date (DD/MM/YYYY)</Label>
        <Input
          id="expiryDate"
          type="text"
          placeholder="DD/MM/YYYY"
          maxLength={10}
          value={formData.expiryDate}
          onChange={(e) => {
            let val = e.target.value;
            
            if (formData.expiryDate && val.length < formData.expiryDate.length) {
              onInputChange("expiryDate", val);
              return;
            }

            val = val.replace(/\D/g, "");
            
            if (val.length >= 2) {
              const day = parseInt(val.substring(0, 2), 10);
              if (day > 31) val = "31" + val.substring(2);
              else if (day === 0) val = "01" + val.substring(2);
            }
            
            if (val.length >= 4) {
              const month = parseInt(val.substring(2, 4), 10);
              if (month > 12) val = val.substring(0, 2) + "12" + val.substring(4);
              else if (month === 0) val = val.substring(0, 2) + "01" + val.substring(4);
            }
            
            if (val.length >= 8) {
              let year = parseInt(val.substring(4, 8), 10);
              if (year < 2000) year = 2000;
              if (year > 2100) year = 2100;
              val = val.substring(0, 4) + year.toString();
            }

            let formatted = val;
            if (formatted.length >= 2) {
              formatted = formatted.substring(0, 2) + "/" + formatted.substring(2);
            }
            if (formatted.length >= 5) {
              formatted = formatted.substring(0, 5) + "/" + formatted.substring(5, 9);
            }
            onInputChange("expiryDate", formatted);
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="batchNumber">Batch Number</Label>
        <Input
          id="batchNumber"
          value={formData.batchNumber}
          onChange={(e) => onInputChange("batchNumber", e.target.value)}
          placeholder="e.g., ABC12345"
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

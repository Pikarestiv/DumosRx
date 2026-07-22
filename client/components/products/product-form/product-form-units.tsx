import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { Product } from "../types";

interface ProductFormUnitsProps {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  commonSuggestions: {
    units: string[];
    [key: string]: any;
  };
}

export function ProductFormUnits({
  formData,
  onInputChange,
  commonSuggestions,
}: ProductFormUnitsProps) {
  return (
    <div className="border-t pt-4 space-y-4">
      <h4 className="font-medium text-sm">Stock Batch Units (Conversions)</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="baseUnit">Base Unit *</Label>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    The smallest unit you sell to customers (e.g. Sachet,
                    Tablet, Piece).
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <SearchableInput
            id="baseUnit"
            value={formData.baseUnit}
            onValueChange={(val) => onInputChange("baseUnit", val)}
            options={commonSuggestions.units}
            placeholder="e.g. Sachet, Tablet, Piece"
            required
          />
        </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="bulkUnit">Bulk Unit (Optional)</Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        The larger package you buy from suppliers (e.g. Carton,
                        Pack, Box).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <SearchableInput
                id="bulkUnit"
                value={formData.bulkUnit}
                onValueChange={(val) => onInputChange("bulkUnit", val)}
                options={commonSuggestions.units}
                placeholder="e.g. Carton, Pack, Box"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="unitsPerBulk">Units per Bulk</Label>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        How many Base Units are inside one Bulk Unit (e.g. if 1
                        Carton has 24 Sachets, put 24 here).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="unitsPerBulk"
                type="number"
                value={formData.unitsPerBulk === 0 ? "" : formData.unitsPerBulk}
                onChange={(e) =>
                  onInputChange("unitsPerBulk", parseInt(e.target.value) || 0)
                }
                onFocus={(e) => e.target.select()}
                min="1"
              />
            </div>

      </div>
      <p className="text-[10px] text-muted-foreground">
        Example: 1 {formData.bulkUnit || "Bulk Unit"} = {formData.unitsPerBulk}{" "}
        {formData.baseUnit || "Base Unit"}(s)
      </p>
    </div>
  );
}

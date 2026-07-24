import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Product } from "./types";

interface Props {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  commonSuggestions: { units: string[] };
}

export function ProductPackagingFields({ formData, onInputChange, commonSuggestions }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b pb-2">
        <h3 className="font-serif font-bold text-lg">Packaging & Units</h3>
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 opacity-50 cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px]">
              <p>
                You buy in bulk (e.g., Carton) but sell and track stock in base
                units (e.g., Tablet). Reorder level, stock counts, and sales are
                always in base units — this section just defines the conversion.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-accent/5 p-4 rounded-lg border border-accent/10">
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="bulkUnit" className="text-xs font-semibold text-primary">
              Bulk Unit (purchasing)
            </Label>
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>The unit you order from suppliers in, e.g. Carton, Box, Pack.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <SearchableInput
            id="bulkUnit"
            value={formData.bulkUnit || ""}
            onValueChange={(val) => onInputChange("bulkUnit", val)}
            options={["Carton", "Pack", "Box", "Roll"]}
            placeholder="e.g., Carton"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unitsPerBulk" className="text-xs font-semibold text-muted-foreground">
            Contains how many base units?
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">1 Bulk =</span>
            <Input
              id="unitsPerBulk"
              type="number"
              min="1"
              value={formData.unitsPerBulk}
              onChange={(e) => onInputChange("unitsPerBulk", parseInt(e.target.value) || 1)}
              className="w-full"
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="baseUnit" className="text-xs font-semibold text-primary">
              Base Unit (selling & stock)
            </Label>
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    The smallest unit you sell, e.g. Tablet, Capsule, Softgel.
                    Stock levels and Reorder Level are always shown in this unit.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <SearchableInput
            id="baseUnit"
            value={formData.baseUnit || ""}
            onValueChange={(val) => onInputChange("baseUnit", val)}
            options={commonSuggestions.units}
            placeholder="e.g., Tablet"
          />
        </div>
      </div>
    </div>
  );
}

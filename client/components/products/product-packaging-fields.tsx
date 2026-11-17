import { Input } from "@/components/ui/input";
import { UnitSelect } from "./unit-select";
import { HelpCircle } from "lucide-react";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { FieldLabel } from "./field-label";
import type { Product } from "./types";

interface Props {
  formData: Product;
  onInputChange: (field: keyof Product, value: string | number | boolean | null) => void;
}

export function ProductPackagingFields({ formData, onInputChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b pb-2">
        <h3 className="font-serif font-bold text-lg">Packaging & Units</h3>
        <HintTooltip text="You buy in bulk (e.g., Carton) but sell and track stock in base units (e.g., Tablet). Reorder level, stock counts, and sales are always in base units. This section just defines the conversion.">
          <HelpCircle tabIndex={-1} className="w-3.5 h-3.5 opacity-50 cursor-help" />
        </HintTooltip>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-accent/5 p-4 rounded-lg border border-accent/10">
        <div className="space-y-2">
          <FieldLabel
            htmlFor="bulkUnit"
            className="text-xs font-semibold text-primary"
            hint="The unit you order from suppliers in, e.g. Carton, Box, Pack."
          >
            Bulk Unit (purchasing)
          </FieldLabel>
          <UnitSelect
            id="bulkUnit"
            value={formData.bulkUnit || ""}
            onValueChange={(val) => onInputChange("bulkUnit", val)}
            placeholder="e.g., Carton"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel
            htmlFor="unitsPerBulk"
            className="text-xs font-semibold text-muted-foreground"
            hint="How many base units are inside one bulk unit, e.g. 1 Carton = 24 Tablets."
          >
            Contains how many base units?
          </FieldLabel>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">
              1 {formData.bulkUnit || "Bulk"} =
            </span>
            <Input
              id="unitsPerBulk"
              type="number"
              inputMode="numeric"
              min="1"
              value={formData.unitsPerBulk}
              onChange={(e) => onInputChange("unitsPerBulk", parseInt(e.target.value) || 1)}
              className="w-full"
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel
            htmlFor="baseUnit"
            className="text-xs font-semibold text-primary"
            hint="The smallest unit you sell, e.g. Tablet, Capsule, Softgel. Stock levels and Reorder Level are always shown in this unit."
          >
            Base Unit (selling & stock)
          </FieldLabel>
          <UnitSelect
            id="baseUnit"
            value={formData.baseUnit || ""}
            onValueChange={(val) => onInputChange("baseUnit", val)}
            placeholder="e.g., Tablet"
          />
        </div>
      </div>
      {formData.bulkUnit && formData.unitsPerBulk && formData.baseUnit && (
        <p className="text-xs text-muted-foreground text-center -mt-2">
          1 {formData.bulkUnit} = {formData.unitsPerBulk} {formData.baseUnit}
          {formData.unitsPerBulk === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

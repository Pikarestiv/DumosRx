import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import type { Medicine } from "../types";

interface MedicineFormUnitsProps {
  formData: Medicine;
  onInputChange: (field: keyof Medicine, value: any) => void;
  commonSuggestions: {
    units: string[];
    [key: string]: any;
  };
}

export function MedicineFormUnits({
  formData,
  onInputChange,
  commonSuggestions,
}: MedicineFormUnitsProps) {
  return (
    <div className="border-t pt-4 space-y-4">
      <h4 className="font-medium text-sm">Inventory Units (Conversions)</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="baseUnit">Base Unit *</Label>
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
          <Label htmlFor="bulkUnit">Bulk Unit (Optional)</Label>
          <SearchableInput
            id="bulkUnit"
            value={formData.bulkUnit}
            onValueChange={(val) => onInputChange("bulkUnit", val)}
            options={commonSuggestions.units}
            placeholder="e.g. Carton, Pack, Box"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitsPerBulk">Units per Bulk</Label>
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
        Example: 1 {formData.bulkUnit || "Bulk Unit"} ={" "}
        {formData.unitsPerBulk} {formData.baseUnit || "Base Unit"}(s)
      </p>
    </div>
  );
}

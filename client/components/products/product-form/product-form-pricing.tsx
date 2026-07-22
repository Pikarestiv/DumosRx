import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import type { Product } from "../types";

interface ProductFormPricingProps {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  suggestions: {
    manufacturers: string[];
    [key: string]: any;
  };
}

export function ProductFormPricing({
  formData,
  onInputChange,
  suggestions,
}: ProductFormPricingProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="manufacturer">Manufacturer</Label>
        <SearchableInput
          options={suggestions.manufacturers}
          value={formData.manufacturer}
          onValueChange={(val) => onInputChange("manufacturer", val)}
          placeholder="Select or type manufacturer"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="supplier">Supplier</Label>
        <SearchableInput
          id="supplier"
          value={formData.supplier}
          onValueChange={(val) => onInputChange("supplier", val)}
          options={[
            "Wholesale Pharma Ltd",
            "Global Drugs Inc",
            "Local Supplier A",
            "Mega Distributors",
          ]}
          placeholder="Supplier name"
        />
      </div>



      <div className="space-y-2">
        <Label htmlFor="sellingPrice">Selling Price (₦)</Label>
        <Input
          id="sellingPrice"
          type="number"
          value={formData.sellingPrice === 0 ? "" : formData.sellingPrice}
          onChange={(e) =>
            onInputChange("sellingPrice", parseFloat(e.target.value) || 0)
          }
          onFocus={(e) => e.target.select()}
          placeholder="0.00"
          min="0"
          step="0.01"
        />
      </div>
    </>
  );
}

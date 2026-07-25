import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "./types";
import type { ProductSuggestions } from "./product-form-fields";

interface Props {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  isPharmacy: boolean;
  suggestions: ProductSuggestions;
  t: (key: string) => string;
  isOpen: boolean;
  onToggle: () => void;
}

export function ProductAdditionalDetailsFields({ formData, onInputChange, isPharmacy, suggestions, t, isOpen, onToggle }: Props) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full font-serif font-bold text-lg border-b pb-2 text-left hover:text-primary transition-colors focus:outline-none"
      >
        <span>Additional Details (Optional)</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 transition-all overflow-hidden", isOpen ? "max-h-[1000px] opacity-100 mt-4" : "max-h-0 opacity-0 m-0")}>
        {isPharmacy && (
          <div className="space-y-2">
            <Label htmlFor="genericName">Generic Name</Label>
            <SearchableInput
              id="genericName"
              value={formData.genericName}
              onValueChange={(val) => onInputChange("genericName", val)}
              options={suggestions.generics || []}
              placeholder="e.g., Acetaminophen"
            />
          </div>
        )}

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
          <Label htmlFor="nafdacNumber">{t("registration_number")}</Label>
          <Input
            id="nafdacNumber"
            value={formData.nafdacNumber}
            onChange={(e) => onInputChange("nafdacNumber", e.target.value)}
            placeholder="e.g., 04-1234"
          />
        </div>

        {isPharmacy && (
          <div className="space-y-4 pt-2 md:col-span-2 flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="requiresPrescription" className="flex-1 cursor-pointer">
                Requires Prescription (Rx)
              </Label>
              <Switch
                id="requiresPrescription"
                checked={formData.requiresPrescription}
                onCheckedChange={(checked) => onInputChange("requiresPrescription", checked)}
              />
            </div>
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="isControlled" className="flex-1 cursor-pointer">
                Controlled Substance
              </Label>
              <Switch
                id="isControlled"
                checked={formData.isControlled}
                onCheckedChange={(checked) => onInputChange("isControlled", checked)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

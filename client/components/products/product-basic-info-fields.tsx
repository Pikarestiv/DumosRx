import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import { ProductCombobox } from "@/components/ui/product-combobox";
import { Button } from "@/components/ui/button";
import { ScanLine, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Product } from "./types";
import type { ProductSuggestions } from "./product-form-fields";

interface Props {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  isPharmacy: boolean;
  suggestions: ProductSuggestions;
  t: (key: string) => string;
  onScanClick: () => void;
}

export function ProductBasicInfoFields({
  formData,
  onInputChange,
  isPharmacy,
  suggestions,
  t,
  onScanClick,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="font-serif font-bold text-lg border-b pb-2">
        Basic Information
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-[1px]">
        <div className="space-y-2">
          <Label htmlFor="name">{t("product")} Name *</Label>
          <ProductCombobox
            value={formData.name}
            onChange={(option) => {
              onInputChange("name", option.name);
              if (option.source === "local" || option.source === "global") {
                onInputChange("genericName", option.generic_name || "");
                onInputChange("manufacturer", option.manufacturer || "");
                onInputChange("strength", option.strength || "");
                onInputChange("dosageForm", option.dosageForm || "");
              }
            }}
            onClear={() => {
              onInputChange("genericName", "");
              onInputChange("manufacturer", "");
              onInputChange("strength", "");
              onInputChange("dosageForm", "");
            }}
            placeholder={`e.g., ${isPharmacy ? "Panadol Extra" : "Product Name"}`}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="category">
              {isPharmacy && t("category") === "Therapeutic Class"
                ? "Therapeutic Class / Drug Category"
                : t("category")}
            </Label>
            {isPharmacy && (
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 opacity-50 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      What type of medicine is this? E.g., Pain Relief,
                      Antibiotic, Vitamin.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <SearchableInput
            options={suggestions.categories}
            value={formData.category}
            onValueChange={(val) => onInputChange("category", val)}
            placeholder="Select or type category"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="strength">Strength / Size</Label>
          <SearchableInput
            id="strength"
            value={formData.strength}
            onValueChange={(val) => onInputChange("strength", val)}
            options={
              isPharmacy
                ? suggestions.strengths
                : ["Small", "Medium", "Large", "1kg", "500g", "1L", "500ml"]
            }
            placeholder="e.g., 500mg or 1L"
          />
        </div>

        {isPharmacy && (
          <div className="space-y-2">
            <Label htmlFor="dosageForm">Dosage Form</Label>
            <SearchableInput
              options={suggestions.dosageForms || []}
              value={formData.dosageForm}
              onValueChange={(val) => onInputChange("dosageForm", val)}
              placeholder="Select or type dosage form"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="sellingPrice">Selling Price (₦)</Label>
          <Input
            id="sellingPrice"
            type="number"
            min="0"
            step="0.01"
            value={formData.sellingPrice || ""}
            onChange={(e) =>
              onInputChange("sellingPrice", parseFloat(e.target.value) || 0)
            }
            placeholder="e.g., 1500"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="reorderLevel">
              Reorder Level{" "}
              {formData.baseUnit
                ? `(in ${formData.baseUnit}s)`
                : "(in base units)"}
            </Label>
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Always entered in base units (see Packaging & Units below),
                    not bulk units. You&apos;ll be alerted when stock falls to
                    or below this number.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="reorderLevel"
            type="number"
            min="0"
            value={formData.reorderLevel || ""}
            onChange={(e) =>
              onInputChange("reorderLevel", parseInt(e.target.value) || 0)
            }
            placeholder="e.g., 10"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
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
              onClick={onScanClick}
              title="Scan Barcode"
            >
              <ScanLine className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

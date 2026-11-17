import { Input } from "@/components/ui/input";
import { ProductCombobox } from "@/components/ui/product-combobox";
import { CategoryCombobox } from "@/components/ui/category-combobox";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";
import type { Product } from "./types";
import { FieldLabel } from "./field-label";
import { getCurrencySymbol } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";

interface Props {
  formData: Product;
  onInputChange: (field: keyof Product, value: string | number | boolean | null) => void;
  isPharmacy: boolean;
  t: (key: string) => string;
  onScanClick: () => void;
  lastUsedCategory?: string;
}

export function ProductBasicInfoFields({
  formData,
  onInputChange,
  isPharmacy,
  t,
  onScanClick,
  lastUsedCategory,
}: Props) {
  const { storeProfile } = useStore();
  const currencySymbol = getCurrencySymbol(storeProfile?.currency);
  return (
    <div className="space-y-4">
      <h3 className="font-serif font-bold text-lg border-b pb-2">
        Basic Information
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-[1px]">
        <div className="space-y-2">
          <FieldLabel
            htmlFor="name"
            hint={`What you and your customers call it. Put the size or strength in the name if that is how you spot it quickly, e.g. ${isPharmacy ? "Panadol Extra 500mg" : "Cussons Baby Lotion 200ml"}.`}
          >
            {t("product")} Name *
          </FieldLabel>
          <ProductCombobox
            value={formData.name}
            showCreateNewOption={false}
            onChange={(option) => {
              onInputChange("name", option.name);
              if (option.source === "local" || option.source === "global") {
                onInputChange("genericName", option.generic_name || "");
                onInputChange("manufacturer", option.manufacturer || "");
                onInputChange("strength", option.strength || "");
                onInputChange("dosageForm", option.dosageForm || "");
                if (option.category) {
                  onInputChange("category", option.category);
                }
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
          <FieldLabel
            htmlFor="category"
            hint="Groups similar products for filtering and reports, e.g. Perfumes, Antibiotics, Drinks."
          >
            {t("category")}
          </FieldLabel>
          <CategoryCombobox
            id="category"
            value={formData.category}
            onValueChange={(val) => onInputChange("category", val)}
            lastUsed={lastUsedCategory}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel
            htmlFor="sellingPrice"
            hint="What a customer pays for one base unit (see Packaging & Units below)."
          >
            Selling Price ({currencySymbol})
          </FieldLabel>
          <Input
            id="sellingPrice"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={formData.sellingPrice || ""}
            onChange={(e) =>
              onInputChange("sellingPrice", parseFloat(e.target.value) || 0)
            }
            placeholder="e.g., 1500"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel
            htmlFor="reorderLevel"
            hint="Always entered in base units (see Packaging & Units below), not bulk units. You'll be alerted when stock falls to or below this number."
          >
            Reorder Level{" "}
            {formData.baseUnit ? `(in ${formData.baseUnit}s)` : "(in base units)"}
          </FieldLabel>
          <Input
            id="reorderLevel"
            type="number"
            inputMode="decimal"
            min="0"
            value={formData.reorderLevel || ""}
            onChange={(e) =>
              onInputChange("reorderLevel", parseInt(e.target.value) || 0)
            }
            placeholder="e.g., 10"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <FieldLabel
            htmlFor="barcode"
            hint="The code printed on the pack. Scan it here once, then scan it at the till to add this product to a sale."
          >
            Barcode (Optional)
          </FieldLabel>
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

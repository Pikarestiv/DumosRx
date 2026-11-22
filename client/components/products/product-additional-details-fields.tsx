import { Input } from "@/components/ui/input";
import { FieldLabel } from "./field-label";
import { SearchableInput } from "@/components/ui/searchable-input";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { toast } from "sonner";
import type { Product } from "./types";
import type { ProductSuggestions } from "./product-form-fields";

interface Props {
  formData: Product;
  onInputChange: (field: keyof Product, value: string | number | boolean | null) => void;
  isPharmacy: boolean;
  suggestions: ProductSuggestions;
  t: (key: string) => string;
  isOpen: boolean;
  onToggle: () => void;
}

export function ProductAdditionalDetailsFields({
  formData,
  onInputChange,
  isPharmacy,
  suggestions,
  t,
  isOpen,
  onToggle,
}: Props) {
  const { canUseEcommerce, getUpgradeMessage } = useFeatureGate();

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

      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-4 pl-[1px] transition-all overflow-hidden",
          isOpen ? "max-h-[1000px] opacity-100 mt-4" : "max-h-0 opacity-0 m-0",
        )}
      >
        <div className="space-y-2">
          <FieldLabel
            htmlFor="strength"
            hint="Optional size or strength, e.g. 500mg or 1L. Shown on the product card. You can also put it in the name."
          >
            Strength / Size
          </FieldLabel>
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
            <FieldLabel
              htmlFor="dosageForm"
              hint="How the medicine is taken, e.g. Tablet, Syrup, Capsule, Injection."
            >
              Dosage Form
            </FieldLabel>
            <SearchableInput
              id="dosageForm"
              options={suggestions.dosageForms || []}
              value={formData.dosageForm}
              onValueChange={(val) => onInputChange("dosageForm", val)}
              placeholder="Select or type dosage form"
            />
          </div>
        )}

        {isPharmacy && (
          <div className="space-y-2">
            <FieldLabel
              htmlFor="genericName"
              hint="The active ingredient, e.g. Paracetamol. Helps staff find alternatives when a brand is out of stock."
            >
              Generic Name
            </FieldLabel>
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
          <FieldLabel htmlFor="manufacturer" hint="The company that makes the product.">
            Manufacturer
          </FieldLabel>
          <SearchableInput
            id="manufacturer"
            options={suggestions.manufacturers}
            value={formData.manufacturer}
            onValueChange={(val) => onInputChange("manufacturer", val)}
            placeholder="Select or type manufacturer"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel
            htmlFor="nafdacNumber"
            hint="The registration number the regulator prints on the pack, if the product has one."
          >
            {t("registration_number")}
          </FieldLabel>
          <Input
            id="nafdacNumber"
            value={formData.nafdacNumber}
            onChange={(e) => onInputChange("nafdacNumber", e.target.value)}
            placeholder="e.g., 04-1234"
          />
        </div>

        <div className="space-y-2">
          <FieldLabel
            htmlFor="location"
            hint="Default shelf or storage bin for this product (new stock batches inherit it when received)."
          >
            Location / Shelf
          </FieldLabel>
          <Input
            id="location"
            value={formData.location || ""}
            onChange={(e) => onInputChange("location", e.target.value)}
            placeholder="e.g., Shelf A2, Fridge 1"
          />
        </div>

        {isPharmacy && (
          <div className="pt-2 md:col-span-2 flex flex-row flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <FieldLabel
                htmlFor="requiresPrescription"
                className="cursor-pointer whitespace-nowrap"
                hint="Marks this as a prescription-only medicine."
              >
                Requires Prescription (Rx)
              </FieldLabel>
              <Switch
                id="requiresPrescription"
                checked={formData.requiresPrescription}
                onCheckedChange={(checked) =>
                  onInputChange("requiresPrescription", checked)
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <FieldLabel
                htmlFor="isControlled"
                className="cursor-pointer whitespace-nowrap"
                hint="Flags this as a controlled substance."
              >
                Controlled Substance
              </FieldLabel>
              <Switch
                id="isControlled"
                checked={formData.isControlled}
                onCheckedChange={(checked) =>
                  onInputChange("isControlled", checked)
                }
              />
            </div>
          </div>
        )}

        <div className="pt-2 md:col-span-2 flex items-center gap-2">
          <FieldLabel
            htmlFor="showOnline"
            className="cursor-pointer whitespace-nowrap"
            hint="Lists this product on your public online store. The online store must also be enabled in Settings."
          >
            Show Online
          </FieldLabel>
          <Switch
            id="showOnline"
            checked={formData.showOnline}
            onCheckedChange={(checked) => {
              if (checked && !canUseEcommerce) {
                toast.error(getUpgradeMessage('ecommerce', "Upgrade to a premium plan to sell this product on your online store."));
                return;
              }
              onInputChange("showOnline", checked);
            }}
          />
          <span className="text-xs text-muted-foreground">
            List this product on your online store (also requires Online Store enabled in Settings)
          </span>
        </div>
      </div>
    </div>
  );
}

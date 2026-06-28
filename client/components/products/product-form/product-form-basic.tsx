import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import { ProductCombobox } from "@/components/ui/product-combobox";
import type { Product } from "../types";

interface ProductFormBasicProps {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  isPharmacy: boolean;
  suggestions: {
    names: string[];
    generics?: string[];
    categories: string[];
    dosageForms?: string[];
    strengths: string[];
    [key: string]: any;
  };
  t: (key: string) => string;
}

export function ProductFormBasic({
  formData,
  onInputChange,
  isPharmacy,
  suggestions,
  t,
}: ProductFormBasicProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">{t("product")} Name *</Label>
        <ProductCombobox
          value={formData.name}
          onChange={(option) => {
            onInputChange("name", option.name);
            if (option.source === "local") {
              onInputChange("brand", option.brand_name || "");
              onInputChange("genericName", option.generic_name || "");
              onInputChange("manufacturer", option.manufacturer || "");
            }
          }}
          placeholder={`e.g., ${isPharmacy ? "Paracetamol" : "Product Name"}`}
        />
        {/* <SearchableInput
          id="name"
          value={formData.name}
          onValueChange={(val) => onInputChange("name", val)}
          options={suggestions.names}
          placeholder={`e.g., ${isPharmacy ? "Paracetamol" : "Product Name"}`}
          required
        /> */}
      </div>

      {isPharmacy && (
        <div className="space-y-2">
          <Label htmlFor="genericName">Generic Name *</Label>
          <SearchableInput
            id="genericName"
            value={formData.genericName}
            onValueChange={(val) => onInputChange("genericName", val)}
            options={suggestions.generics || []}
            placeholder="e.g., Acetaminophen"
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="brand">Brand Name</Label>
        <SearchableInput
          id="brand"
          value={formData.brand}
          onValueChange={(val) => onInputChange("brand", val)}
          options={suggestions.names}
          placeholder={`e.g., ${isPharmacy ? "Panadol" : "Brand Name"}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">{t("category")}</Label>
        <SearchableInput
          options={suggestions.categories}
          value={formData.category}
          onValueChange={(val) => onInputChange("category", val)}
          placeholder="Select or type category"
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
    </>
  );
}

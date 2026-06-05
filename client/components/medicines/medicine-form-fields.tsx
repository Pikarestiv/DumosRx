import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";
import { Switch } from "@/components/ui/switch";
import { Medicine } from "./types";

interface MedicineFormFieldsProps {
  formData: Medicine;
  onInputChange: (field: keyof Medicine, value: any) => void;
  isStore: boolean;
  suggestions: {
    names: string[];
    generics?: string[];
    categories: string[];
    dosageForms?: string[];
    manufacturers: string[];
    strengths: string[];
  };
  commonSuggestions: {
    units: string[];
  };
  t: (key: string) => string;
}

export function MedicineFormFields({
  formData,
  onInputChange,
  isStore,
  suggestions,
  commonSuggestions,
  t,
}: MedicineFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("product")} Name *</Label>
          <SearchableInput
            id="name"
            value={formData.name}
            onValueChange={(val) => onInputChange("name", val)}
            options={suggestions.names}
            placeholder={`e.g., ${isStore ? "Paracetamol" : "Product Name"}`}
            required
          />
        </div>

        {isStore && (
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
            placeholder={`e.g., ${isStore ? "Panadol" : "Brand Name"}`}
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
          <Label htmlFor="nafdacNumber">
            {t("registration_number")} {isStore ? "*" : ""}
          </Label>
          <Input
            id="nafdacNumber"
            value={formData.nafdacNumber}
            onChange={(e) => onInputChange("nafdacNumber", e.target.value)}
            placeholder="e.g., 04-1234"
            required={isStore}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="strength">Strength / Size</Label>
          <SearchableInput
            id="strength"
            value={formData.strength}
            onValueChange={(val) => onInputChange("strength", val)}
            options={
              isStore
                ? suggestions.strengths
                : ["Small", "Medium", "Large", "1kg", "500g", "1L", "500ml"]
            }
            placeholder="e.g., 500mg or 1L"
          />
        </div>

        {isStore && (
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
          <Label htmlFor="costPrice">Cost Price (₦)</Label>
          <Input
            id="costPrice"
            type="number"
            value={formData.costPrice === 0 ? "" : formData.costPrice}
            onChange={(e) =>
              onInputChange(
                "costPrice",
                parseFloat(e.target.value) || 0,
              )
            }
            onFocus={(e) => e.target.select()}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sellingPrice">Selling Price (₦)</Label>
          <Input
            id="sellingPrice"
            type="number"
            value={formData.sellingPrice === 0 ? "" : formData.sellingPrice}
            onChange={(e) =>
              onInputChange(
                "sellingPrice",
                parseFloat(e.target.value) || 0,
              )
            }
            onFocus={(e) => e.target.select()}
            placeholder="0.00"
            min="0"
            step="0.01"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stockQuantity">Stock Quantity</Label>
          <Input
            id="stockQuantity"
            type="number"
            value={
              formData.stockQuantity === 0 ? "" : formData.stockQuantity
            }
            onChange={(e) =>
              onInputChange(
                "stockQuantity",
                parseInt(e.target.value) || 0,
              )
            }
            onFocus={(e) => e.target.select()}
            placeholder="0"
            min="0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reorderLevel">Reorder Level</Label>
          <Input
            id="reorderLevel"
            type="number"
            value={formData.reorderLevel === 0 ? "" : formData.reorderLevel}
            onChange={(e) =>
              onInputChange(
                "reorderLevel",
                parseInt(e.target.value) || 0,
              )
            }
            onFocus={(e) => e.target.select()}
            placeholder="0"
            min="0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiryDate">Expiry Date</Label>
          <Input
            id="expiryDate"
            type="date"
            value={formData.expiryDate}
            onChange={(e) =>
              onInputChange("expiryDate", e.target.value)
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="batchNumber">Batch Number</Label>
          <Input
            id="batchNumber"
            value={formData.batchNumber}
            onChange={(e) =>
              onInputChange("batchNumber", e.target.value)
            }
            placeholder="e.g., ABC12345"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="barcode">Barcode (Optional)</Label>
          <Input
            id="barcode"
            value={formData.barcode}
            onChange={(e) =>
              onInputChange("barcode", e.target.value)
            }
            placeholder="Scan or type barcode"
          />
        </div>

        <div className="space-y-2 flex flex-col justify-center">
          <Label htmlFor="showOnline" className="mb-2">Show in Public Storefront</Label>
          <div className="flex items-center space-x-2">
            <Switch
              id="showOnline"
              checked={formData.showOnline}
              onCheckedChange={(checked) => onInputChange("showOnline", checked)}
            />
            <span className="text-sm text-muted-foreground">
              {formData.showOnline ? "Visible online" : "Hidden"}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t pt-4 space-y-4">
        <h4 className="font-medium text-sm">
          Inventory Units (Conversions)
        </h4>
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
              value={
                formData.unitsPerBulk === 0 ? "" : formData.unitsPerBulk
              }
              onChange={(e) =>
                onInputChange(
                  "unitsPerBulk",
                  parseInt(e.target.value) || 0,
                )
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
    </>
  );
}

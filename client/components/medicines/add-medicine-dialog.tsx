"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableInput } from "@/components/ui/searchable-input";

import { useStore } from "@/lib/context/store-context";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";

interface Medicine {
  name: string;
  genericName: string;
  brand: string;
  category: string;
  nafdacNumber: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  supplier: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate: string;
  batchNumber: string;
  baseUnit: string;
  bulkUnit: string;
  unitsPerBulk: number;
  status: "active" | "inactive" | "expired" | "low_stock";
}

interface AddMedicineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddMedicine: (medicine: Medicine) => void;
}

export function AddMedicineDialog({
  open,
  onOpenChange,
  onAddMedicine,
}: AddMedicineDialogProps) {
  const { t, storeType } = useStore();
  const [formData, setFormData] = useState<Medicine>({
    name: "",
    genericName: "",
    brand: "",
    category: "",
    nafdacNumber: "",
    strength: "",
    dosageForm: "",
    manufacturer: "",
    supplier: "",
    costPrice: 0,
    sellingPrice: 0,
    stockQuantity: 0,
    reorderLevel: 0,
    expiryDate: "",
    batchNumber: "",
    baseUnit: "Unit",
    bulkUnit: "",
    unitsPerBulk: 1,
    status: "active",
  });

  const isPharmacy = storeType === "pharmacy";

  const suggestions = isPharmacy ? FORM_SUGGESTIONS.pharmacy : FORM_SUGGESTIONS.retail;
  const commonSuggestions = FORM_SUGGESTIONS.common;

  const categories = suggestions.categories;
  const dosageForms = isPharmacy ? suggestions.dosageForms : [];
  const manufacturers = suggestions.manufacturers;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name) {
      alert("Please enter a name");
      return;
    }

    if (isPharmacy && (!formData.genericName || !formData.nafdacNumber)) {
      alert(
        `Generic Name and ${t("registration_number")} are required for ${t("store").toLowerCase()}s`,
      );
      return;
    }

    // Determine status based on stock and expiry
    let status: Medicine["status"] = "active";
    if (formData.stockQuantity <= formData.reorderLevel) {
      status = "low_stock";
    }
    if (new Date(formData.expiryDate) < new Date()) {
      status = "expired";
    }

    // Convert to snake_case for backend
    const payload = {
      name: formData.name,
      generic_name: formData.genericName,
      brand_name: formData.brand,
      category: formData.category, // Store locally as string
      // category_id: null,
      nafdac_number: formData.nafdacNumber,
      strength: formData.strength,
      dosage_form: formData.dosageForm,
      manufacturer: formData.manufacturer,
      supplier: formData.supplier, // Store locally as string
      // supplier_id: null,
      cost_price: formData.costPrice,
      selling_price: formData.sellingPrice,
      stock_quantity: formData.stockQuantity,
      reorder_level: formData.reorderLevel,
      expiry_date: formData.expiryDate,
      batch_number: formData.batchNumber,
      base_unit: formData.baseUnit,
      bulk_unit: formData.bulkUnit,
      units_per_bulk: formData.unitsPerBulk,
      status: status,
    };

    onAddMedicine(payload as any);

    // Reset form
    setFormData({
      name: "",
      genericName: "",
      brand: "",
      category: "",
      nafdacNumber: "",
      strength: "",
      dosageForm: "",
      manufacturer: "",
      supplier: "",
      costPrice: 0,
      sellingPrice: 0,
      stockQuantity: 0,
      reorderLevel: 0,
      expiryDate: "",
      batchNumber: "",
      baseUnit: "Unit",
      bulkUnit: "",
      unitsPerBulk: 1,
      status: "active",
    });
  };

  const handleInputChange = (field: keyof Medicine, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold">
            Add New {t("product")}
          </DialogTitle>
          <DialogDescription>
            Enter the details for the new {t("product").toLowerCase()}. All
            fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("product")} Name *</Label>
              <SearchableInput
                id="name"
                value={formData.name}
                onValueChange={(val) => handleInputChange("name", val)}
                options={suggestions.names}
                placeholder={`e.g., ${isPharmacy ? "Paracetamol" : "Product Name"}`}
                required
              />
            </div>

            {isPharmacy && (
              <div className="space-y-2">
                <Label htmlFor="genericName">Generic Name *</Label>
                <SearchableInput
                  id="genericName"
                  value={formData.genericName}
                  onValueChange={(val) => handleInputChange("genericName", val)}
                  options={suggestions.generics}
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
                onValueChange={(val) => handleInputChange("brand", val)}
                options={suggestions.names}
                placeholder={`e.g., ${isPharmacy ? "Panadol" : "Brand Name"}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t("category")}</Label>
              <SearchableInput
                options={categories}
                value={formData.category}
                onValueChange={(val) => handleInputChange("category", val)}
                placeholder="Select or type category"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nafdacNumber">
                {t("registration_number")} {isPharmacy ? "*" : ""}
              </Label>
              <Input
                id="nafdacNumber"
                value={formData.nafdacNumber}
                onChange={(e) =>
                  handleInputChange("nafdacNumber", e.target.value)
                }
                placeholder="e.g., 04-1234"
                required={isPharmacy}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="strength">Strength / Size</Label>
              <SearchableInput
                id="strength"
                value={formData.strength}
                onValueChange={(val) => handleInputChange("strength", val)}
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
                  options={dosageForms}
                  value={formData.dosageForm}
                  onValueChange={(val) => handleInputChange("dosageForm", val)}
                  placeholder="Select or type dosage form"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <SearchableInput
                options={manufacturers}
                value={formData.manufacturer}
                onValueChange={(val) => handleInputChange("manufacturer", val)}
                placeholder="Select or type manufacturer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <SearchableInput
                id="supplier"
                value={formData.supplier}
                onValueChange={(val) => handleInputChange("supplier", val)}
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
                  handleInputChange(
                    "costPrice",
                    Number.parseFloat(e.target.value) || 0,
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
                  handleInputChange(
                    "sellingPrice",
                    Number.parseFloat(e.target.value) || 0,
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
                  handleInputChange(
                    "stockQuantity",
                    Number.parseInt(e.target.value) || 0,
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
                  handleInputChange(
                    "reorderLevel",
                    Number.parseInt(e.target.value) || 0,
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
                  handleInputChange("expiryDate", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batchNumber">Batch / Serial Number</Label>
              <Input
                id="batchNumber"
                value={formData.batchNumber}
                onChange={(e) =>
                  handleInputChange("batchNumber", e.target.value)
                }
                placeholder="e.g., ABC12345"
              />
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
                  onValueChange={(val) => handleInputChange("baseUnit", val)}
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
                  onValueChange={(val) => handleInputChange("bulkUnit", val)}
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
                    handleInputChange(
                      "unitsPerBulk",
                      Number.parseInt(e.target.value) || 0,
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-accent hover:bg-accent/90 cursor-pointer"
            >
              Add {t("product")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

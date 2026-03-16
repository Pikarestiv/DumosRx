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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useStore } from "@/lib/context/store-context";

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

  const categories = isPharmacy 
    ? ["Analgesics", "Antibiotics", "Antimalarials", "Vitamins", "Antacids", "Antihypertensives"]
    : ["Groceries", "Beverages", "Personal Care", "Household", "Snacks", "Dairy"];

  const dosageForms = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Inhaler"];
  
  const manufacturers = isPharmacy
    ? ["GSK Nigeria", "Pfizer Nigeria", "Sanofi Nigeria", "Emzor Pharmaceuticals", "May & Baker Nigeria"]
    : ["Unilever Nigeria", "Nestle Nigeria", "PZ Cussons", "Dangote Group", "Flour Mills of Nigeria"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name) {
      alert("Please enter a name");
      return;
    }

    if (isPharmacy && (!formData.genericName || !formData.nafdacNumber)) {
      alert(`Generic Name and ${t('registration_number')} are required for ${t('store').toLowerCase()}s`);
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
            Add New {t('product')}
          </DialogTitle>
          <DialogDescription>
            Enter the details for the new {t('product').toLowerCase()}. All fields marked with * are
            required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('product')} Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder={`e.g., ${isPharmacy ? 'Paracetamol' : 'Product Name'}`}
                required
              />
            </div>

            {isPharmacy && (
              <div className="space-y-2">
                <Label htmlFor="genericName">Generic Name *</Label>
                <Input
                  id="genericName"
                  value={formData.genericName}
                  onChange={(e) =>
                    handleInputChange("genericName", e.target.value)
                  }
                  placeholder="e.g., Acetaminophen"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="brand">Brand Name</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => handleInputChange("brand", e.target.value)}
                placeholder={`e.g., ${isPharmacy ? 'Panadol' : 'Brand Name'}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">{t('category')}</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => handleInputChange("category", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nafdacNumber">{t('registration_number')} {isPharmacy ? '*' : ''}</Label>
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
              <Input
                id="strength"
                value={formData.strength}
                onChange={(e) => handleInputChange("strength", e.target.value)}
                placeholder="e.g., 500mg or 1L"
              />
            </div>

            {isPharmacy && (
              <div className="space-y-2">
                <Label htmlFor="dosageForm">Dosage Form</Label>
                <Select
                  value={formData.dosageForm}
                  onValueChange={(value) =>
                    handleInputChange("dosageForm", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dosage form" />
                  </SelectTrigger>
                  <SelectContent>
                    {dosageForms.map((form) => (
                      <SelectItem key={form} value={form}>
                        {form}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Select
                value={formData.manufacturer}
                onValueChange={(value) =>
                  handleInputChange("manufacturer", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((manufacturer) => (
                    <SelectItem key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => handleInputChange("supplier", e.target.value)}
                placeholder="Supplier name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="costPrice">Cost Price (₦)</Label>
              <Input
                id="costPrice"
                type="number"
                value={formData.costPrice}
                onChange={(e) =>
                  handleInputChange(
                    "costPrice",
                    Number.parseFloat(e.target.value) || 0,
                  )
                }
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
                value={formData.sellingPrice}
                onChange={(e) =>
                  handleInputChange(
                    "sellingPrice",
                    Number.parseFloat(e.target.value) || 0,
                  )
                }
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
                value={formData.stockQuantity}
                onChange={(e) =>
                  handleInputChange(
                    "stockQuantity",
                    Number.parseInt(e.target.value) || 0,
                  )
                }
                placeholder="0"
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorderLevel">Reorder Level</Label>
              <Input
                id="reorderLevel"
                type="number"
                value={formData.reorderLevel}
                onChange={(e) =>
                  handleInputChange(
                    "reorderLevel",
                    Number.parseInt(e.target.value) || 0,
                  )
                }
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
            <h4 className="font-medium text-sm">Inventory Units (Conversions)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="baseUnit">Base Unit *</Label>
                <Input
                  id="baseUnit"
                  value={formData.baseUnit}
                  onChange={(e) => handleInputChange("baseUnit", e.target.value)}
                  placeholder="e.g. Sachet, Tablet, Piece"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulkUnit">Bulk Unit (Optional)</Label>
                <Input
                  id="bulkUnit"
                  value={formData.bulkUnit}
                  onChange={(e) => handleInputChange("bulkUnit", e.target.value)}
                  placeholder="e.g. Carton, Pack, Box"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitsPerBulk">Units per Bulk</Label>
                <Input
                  id="unitsPerBulk"
                  type="number"
                  value={formData.unitsPerBulk}
                  onChange={(e) =>
                    handleInputChange("unitsPerBulk", Number.parseInt(e.target.value) || 1)
                  }
                  min="1"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Example: 1 {formData.bulkUnit || 'Bulk Unit'} = {formData.unitsPerBulk} {formData.baseUnit || 'Base Unit'}(s)
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
              Add {t('product')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

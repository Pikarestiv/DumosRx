"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/context/store-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { Medicine } from "./types";
import { MedicineFormFields } from "./medicine-form-fields";

interface AddMedicineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddMedicine: (medicine: any) => void;
  editingMedicine?: any | null;
}

export function AddMedicineDialog({
  open,
  onOpenChange,
  onAddMedicine,
  editingMedicine,
}: AddMedicineDialogProps) {
  const { t, storeType, storeProfile } = useStore();
  const [formData, setFormData] = useState<Medicine>({
    id: "",
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
    barcode: "",
    baseUnit: "Unit",
    bulkUnit: "",
    unitsPerBulk: 1,
    status: "active",
    showOnline: false,
  });
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Load editing medicine data if provided
  useEffect(() => {
    if (editingMedicine && open) {
      setFormData({
        id: editingMedicine.id || "",
        name: editingMedicine.name || "",
        genericName: editingMedicine.genericName || "",
        brand: editingMedicine.brand || "",
        category: editingMedicine.category || "",
        nafdacNumber: editingMedicine.nafdacNumber || "",
        strength: editingMedicine.strength || "",
        dosageForm: editingMedicine.dosageForm || "",
        manufacturer: editingMedicine.manufacturer || "",
        supplier: editingMedicine.supplier || "",
        costPrice: editingMedicine.costPrice || 0,
        sellingPrice: editingMedicine.sellingPrice || 0,
        stockQuantity: editingMedicine.stockQuantity || 0,
        reorderLevel: editingMedicine.reorderLevel || 0,
        expiryDate: editingMedicine.expiryDate || "",
        batchNumber: editingMedicine.batchNumber || "",
        barcode: editingMedicine.barcode || "",
        baseUnit: editingMedicine.baseUnit || "Unit",
        bulkUnit: editingMedicine.bulkUnit || "",
        unitsPerBulk: editingMedicine.unitsPerBulk || 1,
        status: editingMedicine.status || "active",
        showOnline: editingMedicine.showOnline || false,
      });
    } else if (!editingMedicine && open) {
      setFormData({
        id: "",
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
        barcode: "",
        baseUnit: "Unit",
        bulkUnit: "",
        unitsPerBulk: 1,
        status: "active",
        showOnline: false,
      });
    }
  }, [editingMedicine, open]);

  const isStore = storeType === "pharmacy";

  const [suggestions, setSuggestions] = useState<any>(isStore ? FORM_SUGGESTIONS.store : FORM_SUGGESTIONS.retail);

  useEffect(() => {
    let baseSuggestions = FORM_SUGGESTIONS;
    try {
      const cached = localStorage.getItem("dumos_suggestions");
      if (cached) {
        baseSuggestions = JSON.parse(cached);
      }
    } catch (e) {
      console.error("Failed to parse cached suggestions", e);
    }

    const pharmList = baseSuggestions.store || FORM_SUGGESTIONS.store;
    const retailList = baseSuggestions.retail || FORM_SUGGESTIONS.retail;

    if (isStore) {
      const showRetail = storeProfile?.show_retail_suggestions === 1;
      if (showRetail) {
        const mergeAndUnique = (arr1: string[] = [], arr2: string[] = []) => {
          return Array.from(new Set([...arr1, ...arr2]));
        };
        setSuggestions({
          names: mergeAndUnique(pharmList.names, retailList.names),
          generics: pharmList.generics || [],
          categories: mergeAndUnique(pharmList.categories, retailList.categories),
          manufacturers: mergeAndUnique(pharmList.manufacturers, retailList.manufacturers),
          strengths: pharmList.strengths || [],
          dosageForms: pharmList.dosageForms || [],
        });
      } else {
        setSuggestions(pharmList);
      }
    } else {
      setSuggestions(retailList);
    }
  }, [isStore, storeProfile?.show_retail_suggestions]);

  const commonSuggestions = FORM_SUGGESTIONS.common;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name) {
      setAlertMessage("Please enter a name");
      return;
    }

    if (isStore && (!formData.genericName || !formData.nafdacNumber)) {
      setAlertMessage(
        `Generic Name and ${t("registration_number")} are required for ${t("store").toLowerCase()}s`,
      );
      return;
    }

    // Determine status based on stock and expiry
    let status: Medicine["status"] = "active";
    if (formData.stockQuantity <= formData.reorderLevel) {
      status = "low_stock";
    }
    if (formData.expiryDate && new Date(formData.expiryDate) < new Date()) {
      status = "expired";
    }

    // Convert to snake_case for backend
    const payload = {
      ...(editingMedicine?.id ? { id: editingMedicine.id } : {}),
      name: formData.name,
      generic_name: formData.genericName,
      brand_name: formData.brand,
      category_id: formData.category, // Storing as string name for now
      nafdac_number: formData.nafdacNumber,
      strength: formData.strength,
      dosage_form: formData.dosageForm,
      manufacturer: formData.manufacturer,
      supplier_id: formData.supplier, // Storing as string name for now
      cost_price: formData.costPrice,
      selling_price: formData.sellingPrice,
      stock_quantity: formData.stockQuantity,
      reorder_level: formData.reorderLevel,
      expiry_date: formData.expiryDate,
      batch_number: formData.batchNumber,
      barcode: formData.barcode,
      base_unit: formData.baseUnit,
      bulk_unit: formData.bulkUnit,
      units_per_bulk: formData.unitsPerBulk,
      status: status,
      show_online: formData.showOnline ? 1 : 0,
    };

    onAddMedicine(payload as any);

    // Reset form
    setFormData({
      id: "",
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
      barcode: "",
      baseUnit: "Unit",
      bulkUnit: "",
      unitsPerBulk: 1,
      status: "active",
      showOnline: false,
    });
  };

  const handleInputChange = (field: keyof Medicine, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold text-2xl">
            {editingMedicine ? `Edit ${t("product")}` : `Add New ${t("product")}`}
          </DialogTitle>
          <DialogDescription>
            {editingMedicine
              ? `Update the details for ${editingMedicine.name}. All fields marked with * are required.`
              : `Enter the details for the new ${t("product").toLowerCase()}. All fields marked with * are required.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <MedicineFormFields
            formData={formData}
            onInputChange={handleInputChange}
            isStore={isStore}
            suggestions={suggestions as any}
            commonSuggestions={commonSuggestions}
            t={t}
          />

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-accent hover:bg-accent/90">
              {editingMedicine ? `Update ${t("product")}` : `Add ${t("product")}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <ConfirmDialog
        open={!!alertMessage}
        onOpenChange={(open) => { if (!open) setAlertMessage(null); }}
        title="Validation Error"
        description={alertMessage || ""}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setAlertMessage(null)}
      />
    </Dialog>
  );
}

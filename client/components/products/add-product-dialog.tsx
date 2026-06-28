"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/context/store-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { Product } from "./types";
import { ProductFormFields } from "./product-form-fields";
import { ProductCombobox } from "@/components/ui/product-combobox";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct: (product: any) => void;
  editingProduct?: any | null;
}

export function AddProductDialog({
  open,
  onOpenChange,
  onAddProduct,
  editingProduct,
}: AddProductDialogProps) {
  const { withRestriction } = useFeatureGate();
  const { t, storeType, storeProfile } = useStore();
  const [formData, setFormData] = useState<Product>({
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

  // Load editing product data if provided
  useEffect(() => {
    if (editingProduct && open) {
      setFormData({
        id: editingProduct.id || "",
        name: editingProduct.name || "",
        genericName: editingProduct.genericName || "",
        brand: editingProduct.brand || "",
        category: editingProduct.category || "",
        nafdacNumber: editingProduct.nafdacNumber || "",
        strength: editingProduct.strength || "",
        dosageForm: editingProduct.dosageForm || "",
        manufacturer: editingProduct.manufacturer || "",
        supplier: editingProduct.supplier || "",
        costPrice: editingProduct.costPrice || 0,
        sellingPrice: editingProduct.sellingPrice || 0,
        stockQuantity: editingProduct.stockQuantity || 0,
        reorderLevel: editingProduct.reorderLevel || 0,
        expiryDate: editingProduct.expiryDate || "",
        batchNumber: editingProduct.batchNumber || "",
        barcode: editingProduct.barcode || "",
        baseUnit: editingProduct.baseUnit || "Unit",
        bulkUnit: editingProduct.bulkUnit || "",
        unitsPerBulk: editingProduct.unitsPerBulk || 1,
        status: editingProduct.status || "active",
        showOnline: editingProduct.showOnline || false,
      });

      // Format YYYY-MM-DD to DD/MM/YYYY for the frontend if necessary
      if (
        editingProduct.expiryDate &&
        editingProduct.expiryDate.includes("-")
      ) {
        setFormData((prev) => ({
          ...prev,
          expiryDate: editingProduct.expiryDate.split("-").reverse().join("/"),
        }));
      }
    } else if (!editingProduct && open) {
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
  }, [editingProduct, open]);

  const isPharmacy = storeType === "pharmacy";

  const [suggestions, setSuggestions] = useState<any>(
    isPharmacy ? FORM_SUGGESTIONS.store : FORM_SUGGESTIONS.retail,
  );

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

    if (isPharmacy) {
      const showRetail = storeProfile?.show_retail_suggestions === 1;
      if (showRetail) {
        const mergeAndUnique = (arr1: string[] = [], arr2: string[] = []) => {
          return Array.from(new Set([...arr1, ...arr2]));
        };
        setSuggestions({
          names: mergeAndUnique(pharmList.names, retailList.names),
          generics: pharmList.generics || [],
          categories: mergeAndUnique(
            pharmList.categories,
            retailList.categories,
          ),
          manufacturers: mergeAndUnique(
            pharmList.manufacturers,
            retailList.manufacturers,
          ),
          strengths: pharmList.strengths || [],
          dosageForms: pharmList.dosageForms || [],
        });
      } else {
        setSuggestions(pharmList);
      }
    } else {
      setSuggestions(retailList);
    }
  }, [isPharmacy, storeProfile?.show_retail_suggestions]);

  const commonSuggestions = FORM_SUGGESTIONS.common;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name) {
      setAlertMessage("Please enter a name");
      return;
    }

    if (isPharmacy && !formData.genericName) {
      setAlertMessage(
        `Generic Name is required for ${t("store").toLowerCase()}s`,
      );
      return;
    }

    // Parse DD/MM/YYYY back to YYYY-MM-DD for backend
    let formattedExpiry = formData.expiryDate;
    if (formattedExpiry) {
      if (formattedExpiry.length !== 10) {
        setAlertMessage(
          "Please enter a complete expiry date (DD/MM/YYYY) or leave it blank.",
        );
        return;
      }

      const parts = formattedExpiry.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        // Basic check for a realistic year (e.g., no 9999 or 1000)
        if (year < 2000 || year > 2100) {
          setAlertMessage("Please enter a realistic expiry year (e.g., 2024).");
          return;
        }

        const date = new Date(year, month - 1, day);
        if (
          date.getFullYear() !== year ||
          date.getMonth() !== month - 1 ||
          date.getDate() !== day
        ) {
          setAlertMessage("The expiry date entered is not a valid date.");
          return;
        }

        // DD/MM/YYYY -> YYYY-MM-DD
        formattedExpiry = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    // Determine status based on stock and expiry
    let status: Product["status"] = "active";
    if (formData.stockQuantity <= formData.reorderLevel) {
      status = "low_stock";
    }
    if (formattedExpiry && new Date(formattedExpiry) < new Date()) {
      status = "expired";
    }

    // Convert to snake_case for backend
    const payload = {
      ...(editingProduct?.id ? { id: editingProduct.id } : {}),
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
      expiry_date: formattedExpiry,
      batch_number: formData.batchNumber,
      barcode: formData.barcode,
      base_unit: formData.baseUnit,
      bulk_unit: formData.bulkUnit,
      units_per_bulk: formData.unitsPerBulk,
      status: status,
      show_online: formData.showOnline ? 1 : 0,
    };

    onAddProduct(payload as any);

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

  const handleInputChange = (field: keyof Product, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold text-2xl">
            {editingProduct
              ? `Edit ${t("product")}`
              : `Add New ${t("product")}`}
          </DialogTitle>
          <DialogDescription>
            {editingProduct
              ? `Update the details for ${editingProduct.name}. All fields marked with * are required.`
              : `Enter the details for the new ${t("product").toLowerCase()}. All fields marked with * are required.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={withRestriction(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <ProductCombobox
                value={formData.name}
                onChange={(option) => {
                  setFormData({
                    ...formData,
                    name: option.name,
                    ...(option.source === "local"
                      ? {
                          brand: option.brand_name || "",
                          genericName: option.generic_name || "",
                          manufacturer: option.manufacturer || "",
                          // Note: We don't overwrite stock or expiry for local products
                        }
                      : {}),
                  });
                }}
                placeholder="Enter product name"
              />
            </div>
          </div>
          <ProductFormFields
            formData={formData}
            onInputChange={handleInputChange}
            isPharmacy={isPharmacy}
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
              {editingProduct
                ? `Update ${t("product")}`
                : `Add ${t("product")}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <ConfirmDialog
        open={!!alertMessage}
        onOpenChange={(open) => {
          if (!open) setAlertMessage(null);
        }}
        title="Validation Error"
        description={alertMessage || ""}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setAlertMessage(null)}
      />
    </Dialog>
  );
}

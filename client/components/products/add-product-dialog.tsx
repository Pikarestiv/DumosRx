"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

import { useStore } from "@/lib/context/store-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { Product } from "./types";
import { ProductFormFields } from "./product-form-fields";
import { query } from "@/lib/db/core";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct: (product: any, keepOpen?: boolean) => void;
  editingProduct?: Product | null;
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
          suppliers: []
        });
      } else {
        setSuggestions({...pharmList, suppliers: []});
      }
    } else {
      setSuggestions({...retailList, suppliers: []});
    }

    query("SELECT name FROM suppliers WHERE _deleted = 0").then((res: any[]) => {
      if (res && Array.isArray(res)) {
        setSuggestions((prev: any) => ({
          ...prev,
          suppliers: res.map((s) => s.name),
        }));
      }
    }).catch(console.error);

  }, [isPharmacy, storeProfile?.show_retail_suggestions]);

  const commonSuggestions = FORM_SUGGESTIONS.common;

  const handleSubmit = (e?: React.FormEvent, keepOpen = false) => {
    if (e) e.preventDefault();

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

    // Determine status
    let status: Product["status"] = formData.status || "active";

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
      selling_price: formData.sellingPrice,
      reorder_level: formData.reorderLevel,
      barcode: formData.barcode,
      base_unit: formData.baseUnit,
      bulk_unit: formData.bulkUnit,
      units_per_bulk: formData.unitsPerBulk,
      is_active: status === "active" ? 1 : 0,
      show_online: formData.showOnline ? 1 : 0,
    };

    onAddProduct(payload as any, keepOpen);

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
    <>
    <ResponsiveModal 
      open={open} 
      onOpenChange={onOpenChange}
      title={
        <span className="font-serif font-bold text-2xl">
          {editingProduct
            ? `Edit ${t("product")}`
            : `Add New ${t("product")}`}
        </span>
      }
      description={
        editingProduct
          ? `Update the details for ${editingProduct.name}. All fields marked with * are required.`
          : `Enter the details for the new ${t("product").toLowerCase()}. All fields marked with * are required.`
      }
      className="sm:max-w-3xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden px-0 sm:px-6 pb-0 sm:pb-6"
      headerClassName="px-4 pt-4 sm:p-0"
    >

        <form onSubmit={withRestriction(handleSubmit)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 sm:px-0 py-2">
            <ProductFormFields
              formData={formData}
              onInputChange={handleInputChange}
              isPharmacy={isPharmacy}
              suggestions={suggestions as any}
              commonSuggestions={commonSuggestions}
              t={t}
            />
          </div>

          <DialogFooter className="bg-background border-t gap-2 p-4 sm:p-0 sm:pt-4 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="border-accent text-accent hover:bg-accent/10 hover:text-primary w-full sm:w-auto"
                onClick={withRestriction((e: any) => handleSubmit(e, true))}
              >
                {editingProduct ? `Update & Add Another` : `Save & Add Another`}
              </Button>
              <Button type="submit" className="bg-accent hover:bg-accent/90 w-full sm:w-auto">
                {editingProduct
                  ? `Update ${t("product")}`
                  : `Add ${t("product")}`}
              </Button>
            </div>
          </DialogFooter>
        </form>
    </ResponsiveModal>
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
    </>
  );
}

"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

import { useStore } from "@/lib/context/store-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FORM_SUGGESTIONS } from "@/lib/constants/suggestions";
import { Product } from "./types";
import { ProductFormFields, type ProductSuggestions } from "./product-form-fields";
import { getSupplierNames } from "@/lib/db/queries/products";
import type { NewProductPayload } from "@/lib/types/product";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct: (product: NewProductPayload, keepOpen?: boolean) => void;
  editingProduct?: Product | null;
  initialData?: Partial<Product>;
  /** Hide "Save & Add Another" — for flows (e.g. quick-adding a product from
   * a purchase order) where the user just wants to create one product and
   * get back to what they were doing. */
  hideAddAnother?: boolean;
}

export function AddProductDialog({
  open,
  onOpenChange,
  onAddProduct,
  editingProduct,
  initialData,
  hideAddAnother,
}: AddProductDialogProps) {
  const { withRestriction } = useFeatureGate();
  const { t, storeType, storeProfile } = useStore();
  const [formData, setFormData] = useState<Product>({
    id: "",
    name: initialData?.name || "",
    genericName: initialData?.genericName || "",
    category: "",
    nafdacNumber: "",
    strength: initialData?.strength || "",
    dosageForm: initialData?.dosageForm || "",
    manufacturer: initialData?.manufacturer || "",
    sellingPrice: 0,
    reorderLevel: 0,
    barcode: "",
    baseUnit: "Unit",
    bulkUnit: "",
    unitsPerBulk: 1,
    status: "active",
    showOnline: false,
    requiresPrescription: false,
    isControlled: false,
    costPrice: 0,
    stockQuantity: 0,
    batchNumber: "",
    expiryDate: "",
  });
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [missingFieldsWarning, setMissingFieldsWarning] = useState<{
    keepOpen: boolean;
    fields: string[];
  } | null>(null);

  // Load editing product data if provided
  useEffect(() => {
    if (editingProduct && open) {
      setFormData({
        id: editingProduct.id || "",
        name: editingProduct.name || "",
        genericName: editingProduct.genericName || "",
        category: editingProduct.category || "",
        nafdacNumber: editingProduct.nafdacNumber || "",
        strength: editingProduct.strength || "",
        dosageForm: editingProduct.dosageForm || "",
        manufacturer: editingProduct.manufacturer || "",
        sellingPrice: editingProduct.sellingPrice || 0,
        reorderLevel: editingProduct.reorderLevel || 0,
        barcode: editingProduct.barcode || "",
        baseUnit: editingProduct.baseUnit || "Unit",
        bulkUnit: editingProduct.bulkUnit || "",
        unitsPerBulk: editingProduct.unitsPerBulk || 1,
        status: editingProduct.status || "active",
        showOnline: editingProduct.showOnline || false,
        requiresPrescription: editingProduct.requiresPrescription || false,
        isControlled: editingProduct.isControlled || false,
        costPrice: editingProduct.costPrice || 0,
        stockQuantity: editingProduct.stockQuantity || 0,
        batchNumber: editingProduct.batchNumber || "",
        expiryDate: editingProduct.expiryDate || "",
      });
    } else if (!editingProduct && open) {
      setFormData({
        id: "",
        name: initialData?.name || "",
        genericName: initialData?.genericName || "",
        category: "",
        nafdacNumber: "",
        strength: initialData?.strength || "",
        dosageForm: initialData?.dosageForm || "",
        manufacturer: initialData?.manufacturer || "",
        sellingPrice: 0,
        reorderLevel: 0,
        barcode: "",
        baseUnit: "Unit",
        bulkUnit: "",
        unitsPerBulk: 1,
        status: "active",
        showOnline: false,
        requiresPrescription: false,
        isControlled: false,
        costPrice: 0,
        stockQuantity: 0,
        batchNumber: "",
        expiryDate: "",
      });
    }
  }, [editingProduct, open, initialData]);

  const isPharmacy = storeType === "pharmacy";

  const [suggestions, setSuggestions] = useState<ProductSuggestions>(
    isPharmacy
      ? { ...FORM_SUGGESTIONS.store, names: [], suppliers: [] }
      : { ...FORM_SUGGESTIONS.retail, names: [], suppliers: [] },
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
        const pharmNames = pharmList.products?.map((p) => p.name) || [];
        const retailNames = retailList.products?.map((p) => p.name) || [];
        setSuggestions({
          names: mergeAndUnique(pharmNames, retailNames),
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
          suppliers: [],
        });
      } else {
        const pharmNames = pharmList.products?.map((p) => p.name) || [];
        setSuggestions({ ...pharmList, names: pharmNames, suppliers: [] });
      }
    } else {
      const retailNames = retailList.products?.map((p) => p.name) || [];
      setSuggestions({ ...retailList, names: retailNames, suppliers: [] });
    }

    getSupplierNames()
      .then((names) => {
        setSuggestions((prev) => ({ ...prev, suppliers: names }));
      })
      .catch(console.error);
  }, [isPharmacy, storeProfile?.show_retail_suggestions]);

  const handleSubmit = (e?: React.FormEvent, keepOpen = false) => {
    if (e) e.preventDefault();

    // Validation
    if (!formData.name) {
      setAlertMessage("Please enter a name");
      return;
    }

    const missingFields: string[] = [];
    if (!formData.sellingPrice) missingFields.push("Selling Price");
    if (!formData.reorderLevel) missingFields.push("Reorder Level");
    if (missingFields.length > 0) {
      setMissingFieldsWarning({ keepOpen, fields: missingFields });
      return;
    }

    submitProduct(keepOpen);
  };

  const submitProduct = (keepOpen: boolean) => {
    // Determine status
    const status: Product["status"] = formData.status || "active";

    // Convert to snake_case for backend
    const payload = {
      ...(editingProduct?.id ? { id: editingProduct.id } : {}),
      name: formData.name,
      generic_name: formData.genericName,
      category_id: formData.category, // Storing as string name for now
      nafdac_number: formData.nafdacNumber,
      strength: formData.strength,
      dosage_form: formData.dosageForm,
      manufacturer: formData.manufacturer,
      selling_price: formData.sellingPrice,
      reorder_level: formData.reorderLevel,
      barcode: formData.barcode,
      base_unit: formData.baseUnit,
      bulk_unit: formData.bulkUnit,
      units_per_bulk: formData.unitsPerBulk,
      is_active: status === "active" ? 1 : 0,
      show_online: formData.showOnline ? 1 : 0,
      requires_prescription: formData.requiresPrescription ? 1 : 0,
      is_controlled: formData.isControlled ? 1 : 0,
    };

    onAddProduct(payload, keepOpen);

    // Reset form
    setFormData({
      id: "",
      name: "",
      genericName: "",
      category: "",
      nafdacNumber: "",
      strength: "",
      dosageForm: "",
      manufacturer: "",
      sellingPrice: 0,
      reorderLevel: 0,
      barcode: "",
      baseUnit: "Unit",
      bulkUnit: "",
      unitsPerBulk: 1,
      status: "active",
      showOnline: false,
      requiresPrescription: false,
      isControlled: false,
      costPrice: 0,
      stockQuantity: 0,
      batchNumber: "",
      expiryDate: "",
    });
  };

  const handleInputChange = (field: keyof Product, value: string | number | boolean | null) => {
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
        footer={
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
              {!hideAddAnother && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-accent text-accent hover:bg-accent/10 hover:text-primary w-full sm:w-auto"
                  onClick={withRestriction((e: React.MouseEvent) => handleSubmit(e, true))}
                >
                  {editingProduct
                    ? `Update & Add Another`
                    : `Save & Add Another`}
                </Button>
              )}
              <Button
                type="submit"
                form="add-product-form"
                className="bg-accent hover:bg-accent/90 w-full sm:w-auto"
              >
                {editingProduct
                  ? `Update ${t("product")}`
                  : `Add ${t("product")}`}
              </Button>
            </div>
          </DialogFooter>
        }
      >
        <form
          id="add-product-form"
          onSubmit={withRestriction(handleSubmit)}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto hide-scrollbar px-4 sm:px-0 py-2">
            <ProductFormFields
              formData={formData}
              onInputChange={handleInputChange}
              isPharmacy={isPharmacy}
              isQuickAdd={!initialData && !editingProduct}
              suggestions={suggestions}
              t={t}
            />
          </div>
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
      <ConfirmDialog
        open={!!missingFieldsWarning}
        onOpenChange={(open) => {
          if (!open) setMissingFieldsWarning(null);
        }}
        title="Missing details"
        description={`${missingFieldsWarning?.fields.join(" and ")} ${missingFieldsWarning && missingFieldsWarning.fields.length > 1 ? "are" : "is"} not set. You can add ${missingFieldsWarning && missingFieldsWarning.fields.length > 1 ? "these" : "this"} later, but stock alerts and sales may not work as expected until you do. Continue anyway?`}
        confirmLabel="Continue Anyway"
        variant="default"
        autoFocusConfirm
        onConfirm={() => {
          if (missingFieldsWarning) submitProduct(missingFieldsWarning.keepOpen);
        }}
      />
    </>
  );
}

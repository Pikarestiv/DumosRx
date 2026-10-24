"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

import { useStore } from "@/lib/context/store-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Product } from "./types";
import { ProductFormFields } from "./product-form-fields";
import {
  emptyProductForm,
  productFormFromEditing,
  useProductSuggestions,
} from "./add-product-form-state";
import type { NewProductPayload } from "@/lib/types/product";
import { capitalizeWords } from "@/lib/hooks/use-uppercase-display";

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `onSaved` is invoked by the caller only once the save actually
   * succeeded, so the form is never cleared out from under a failed save. */
  onAddProduct: (
    product: NewProductPayload,
    keepOpen?: boolean,
    onSaved?: () => void,
  ) => void;
  editingProduct?: Product | null;
  initialData?: Partial<Product>;
  // Hide "Save & Add Another", for flows (e.g.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-products-add-product-dialog-tsx-L33
  hideAddAnother?: boolean;
  /** True while the caller's own create/update mutation is in flight, so the
   * buttons stay disabled for the whole round trip, not just re-entry. */
  isSubmitting?: boolean;
}

export function AddProductDialog({
  open,
  onOpenChange,
  onAddProduct,
  editingProduct,
  initialData,
  hideAddAnother,
  isSubmitting = false,
}: AddProductDialogProps) {
  const { withRestriction } = useFeatureGate();
  const { t, storeType, storeProfile } = useStore();
  const [formData, setFormData] = useState<Product>(() =>
    editingProduct && open
      ? productFormFromEditing(editingProduct)
      : emptyProductForm(initialData),
  );
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [missingFieldsWarning, setMissingFieldsWarning] = useState<{
    keepOpen: boolean;
    fields: string[];
  } | null>(null);

  const [formSource, setFormSource] = useState({ open, editingProduct, initialData });
  if (
    formSource.open !== open ||
    formSource.editingProduct !== editingProduct ||
    formSource.initialData !== initialData
  ) {
    setFormSource({ open, editingProduct, initialData });
    if (open) {
      setFormData(
        editingProduct
          ? productFormFromEditing(editingProduct)
          : emptyProductForm(initialData),
      );
    }
  }

  const isPharmacy = storeType === "pharmacy";

  const suggestions = useProductSuggestions(
    isPharmacy,
    storeProfile?.show_retail_suggestions === 1,
  );

  const handleSubmit = (e?: React.FormEvent, keepOpen = false) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

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

    // Only clear the form once the caller reports the save succeeded — otherwise a failed save would wipe everything the user…
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-products-add-product-dialog-tsx-L246
    onAddProduct(payload, keepOpen, () => setFormData(emptyProductForm()));
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
            ? `Update the details for ${
                storeProfile?.uppercase_display_enabled !== 0
                  ? editingProduct.name.toUpperCase()
                  : capitalizeWords(editingProduct.name)
              }. All fields marked with * are required.`
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
              disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
          <div className="flex-1 overflow-y-auto stable-scrollbar px-4 sm:px-0 py-2">
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

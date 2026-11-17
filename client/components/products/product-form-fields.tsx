import { useState } from "react";
import { toast } from "sonner";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { CameraScannerDialog } from "@/components/pos/camera-scanner-dialog";
import type { Product } from "./types";
import { ProductBasicInfoFields } from "./product-basic-info-fields";
import { ProductAdditionalDetailsFields } from "./product-additional-details-fields";
import { ProductPackagingFields } from "./product-packaging-fields";

export interface ProductSuggestions {
  names: string[];
  generics?: string[];
  categories: string[];
  dosageForms?: string[];
  manufacturers: string[];
  suppliers: string[];
  strengths: string[];
}

interface ProductFormFieldsProps {
  formData: Product;
  onInputChange: (field: keyof Product, value: string | number | boolean | null) => void;
  isPharmacy: boolean;
  lastUsedCategory?: string;
  suggestions: ProductSuggestions;
  t: (key: string) => string;
}

function readDetailsOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.productFormDetailsOpen) === "1";
  } catch {
    return false;
  }
}

export function ProductFormFields({
  formData,
  onInputChange,
  isPharmacy,
  lastUsedCategory,
  suggestions,
  t,
}: ProductFormFieldsProps) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(readDetailsOpen);

  const toggleDetails = () => {
    const next = !isDetailsOpen;
    setIsDetailsOpen(next);
    try {
      localStorage.setItem(STORAGE_KEYS.productFormDetailsOpen, next ? "1" : "0");
    } catch {}
  };

  return (
    <div className="flex flex-col gap-6">
      <ProductBasicInfoFields
        formData={formData}
        onInputChange={onInputChange}
        isPharmacy={isPharmacy}
        t={t}
        lastUsedCategory={lastUsedCategory}
        onScanClick={() => setIsScannerOpen(true)}
      />

      <ProductAdditionalDetailsFields
        formData={formData}
        onInputChange={onInputChange}
        isPharmacy={isPharmacy}
        suggestions={suggestions}
        t={t}
        isOpen={isDetailsOpen}
        onToggle={toggleDetails}
      />

      <ProductPackagingFields
        formData={formData}
        onInputChange={onInputChange}
      />

      <CameraScannerDialog
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(barcode) => {
          onInputChange("barcode", barcode);
          setIsScannerOpen(false);
          toast.success("Barcode scanned successfully");
        }}
      />
    </div>
  );
}

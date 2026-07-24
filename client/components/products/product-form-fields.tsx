import { useState } from "react";
import { toast } from "sonner";
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
  onInputChange: (field: keyof Product, value: any) => void;
  isPharmacy: boolean;
  isQuickAdd?: boolean;
  suggestions: ProductSuggestions;
  commonSuggestions: {
    units: string[];
  };
  t: (key: string) => string;
}

export function ProductFormFields({
  formData,
  onInputChange,
  isPharmacy,
  isQuickAdd = false,
  suggestions,
  commonSuggestions,
  t,
}: ProductFormFieldsProps) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(!isQuickAdd);

  return (
    <div className="flex flex-col gap-6">
      <ProductBasicInfoFields
        formData={formData}
        onInputChange={onInputChange}
        isPharmacy={isPharmacy}
        suggestions={suggestions}
        t={t}
        onScanClick={() => setIsScannerOpen(true)}
      />

      <ProductAdditionalDetailsFields
        formData={formData}
        onInputChange={onInputChange}
        isPharmacy={isPharmacy}
        suggestions={suggestions}
        t={t}
        isOpen={isDetailsOpen}
        onToggle={() => setIsDetailsOpen(!isDetailsOpen)}
      />

      <ProductPackagingFields
        formData={formData}
        onInputChange={onInputChange}
        commonSuggestions={commonSuggestions}
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

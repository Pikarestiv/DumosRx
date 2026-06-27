import React, { useState } from "react";
import { toast } from "sonner";
import { CameraScannerDialog } from "@/components/pos/camera-scanner-dialog";
import type { Product } from "./types";

import { ProductFormBasic } from "./product-form/product-form-basic";
import { ProductFormPricing } from "./product-form/product-form-pricing";
import { ProductFormStock } from "./product-form/product-form-stock";
import { ProductFormUnits } from "./product-form/product-form-units";

interface ProductFormFieldsProps {
  formData: Product;
  onInputChange: (field: keyof Product, value: any) => void;
  isPharmacy: boolean;
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

export function ProductFormFields({
  formData,
  onInputChange,
  isPharmacy,
  suggestions,
  commonSuggestions,
  t,
}: ProductFormFieldsProps) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProductFormBasic
          formData={formData}
          onInputChange={onInputChange}
          isPharmacy={isPharmacy}
          suggestions={suggestions}
          t={t}
        />

        <ProductFormPricing
          formData={formData}
          onInputChange={onInputChange}
          suggestions={suggestions}
        />

        <ProductFormStock
          formData={formData}
          onInputChange={onInputChange}
          onOpenScanner={() => setIsScannerOpen(true)}
        />
      </div>

      <ProductFormUnits
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
    </>
  );
}

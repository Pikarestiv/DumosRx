import React, { useState } from "react";
import { toast } from "sonner";
import { CameraScannerDialog } from "@/components/pos/camera-scanner-dialog";
import type { Medicine } from "./types";

import { MedicineFormBasic } from "./medicine-form/medicine-form-basic";
import { MedicineFormPricing } from "./medicine-form/medicine-form-pricing";
import { MedicineFormStock } from "./medicine-form/medicine-form-stock";
import { MedicineFormUnits } from "./medicine-form/medicine-form-units";

interface MedicineFormFieldsProps {
  formData: Medicine;
  onInputChange: (field: keyof Medicine, value: any) => void;
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

export function MedicineFormFields({
  formData,
  onInputChange,
  isPharmacy,
  suggestions,
  commonSuggestions,
  t,
}: MedicineFormFieldsProps) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MedicineFormBasic
          formData={formData}
          onInputChange={onInputChange}
          isPharmacy={isPharmacy}
          suggestions={suggestions}
          t={t}
        />

        <MedicineFormPricing
          formData={formData}
          onInputChange={onInputChange}
          suggestions={suggestions}
        />

        <MedicineFormStock
          formData={formData}
          onInputChange={onInputChange}
          onOpenScanner={() => setIsScannerOpen(true)}
        />
      </div>

      <MedicineFormUnits
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

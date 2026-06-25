"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "@/lib/context/store-context";

import { useMedicineDetails, Medicine } from "./medicine-details/use-medicine-details";
import { MedicineBasicInfo } from "./medicine-details/medicine-basic-info";
import { MedicineSupplierInfo } from "./medicine-details/medicine-supplier-info";
import { MedicinePricingInfo } from "./medicine-details/medicine-pricing-info";
import { MedicineStockInfo } from "./medicine-details/medicine-stock-info";
import { MedicineBatchHistory } from "./medicine-details/medicine-batch-history";

interface MedicineDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicine: Medicine | null;
}

export function MedicineDetailsDialog({
  open,
  onOpenChange,
  medicine,
}: MedicineDetailsDialogProps) {
  const { storeProfile } = useStore();
  const {
    batches,
    loadingBatches,
    formatPrice,
    formatDate,
    getStatusBadge,
    expiryWarningDays,
    profitMargin,
    daysToExpiry,
  } = useMedicineDetails(medicine, storeProfile);

  if (!medicine) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-left font-serif font-bold text-2xl">
                {medicine.name}
              </DialogTitle>
              <DialogDescription className="text-left text-lg">
                {medicine.genericName}
              </DialogDescription>
            </div>
            {getStatusBadge(medicine.status)}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MedicineBasicInfo medicine={medicine} />
          
          <MedicineSupplierInfo medicine={medicine} />
          
          <MedicinePricingInfo
            medicine={medicine}
            formatPrice={formatPrice}
            profitMargin={profitMargin}
          />
          
          <MedicineStockInfo
            medicine={medicine}
            formatDate={formatDate}
            daysToExpiry={daysToExpiry}
            expiryWarningDays={expiryWarningDays}
          />
        </div>

        <MedicineBatchHistory
          batches={batches}
          loadingBatches={loadingBatches}
          storeType={storeProfile?.store_type || "pharmacy"}
        />
      </DialogContent>
    </Dialog>
  );
}

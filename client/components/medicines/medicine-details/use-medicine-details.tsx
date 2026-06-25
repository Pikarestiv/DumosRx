import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  brand: string;
  category: string;
  nafdacNumber: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  supplier: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate: string;
  batchNumber: string;
  baseUnit: string;
  bulkUnit: string;
  unitsPerBulk: number;
  status: "active" | "inactive" | "expired" | "low_stock";
}

export function useMedicineDetails(
  medicine: Medicine | null,
  storeProfile: any,
) {
  const { data: batches, loading: loadingBatches } = useLocalData<any>(
    medicine
      ? `SELECT * FROM inventory WHERE medicine_id = "${medicine.id}" AND _deleted = 0 ORDER BY expiry_date ASC`
      : "",
  );

  const formatPrice = (amount: number) => {
    return formatCurrency(amount, storeProfile?.currency);
  };

  const formatDate = (dateString: string) => {
    return formatDateToDDMMYYYY(dateString);
  };

  const getStatusBadge = (status: Medicine["status"]): ReactNode => {
    const variants = {
      active: "default",
      inactive: "secondary",
      expired: "destructive",
      low_stock: "outline",
    } as const;

    const labels = {
      active: "Active",
      inactive: "Inactive",
      expired: "Expired",
      low_stock: "Low Stock",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  const expiryWarningDays = storeProfile?.expiry_warning_days || 90;

  const profitMargin = medicine
    ? (
        ((medicine.sellingPrice - medicine.costPrice) / medicine.costPrice) *
        100
      ).toFixed(1)
    : "0.0";

  const daysToExpiry = medicine
    ? Math.ceil(
        (new Date(medicine.expiryDate).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  return {
    batches,
    loadingBatches,
    formatPrice,
    formatDate,
    getStatusBadge,
    expiryWarningDays,
    profitMargin,
    daysToExpiry,
  };
}

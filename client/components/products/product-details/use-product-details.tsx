import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export interface Product {
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

export function useProductDetails(
  product: Product | null,
  storeProfile: any,
) {
  const { data: batches, loading: loadingBatches } = useLocalData<any>(
    product
      ? `SELECT * FROM stock_batches WHERE product_id = "${product.id}" AND _deleted = 0 ORDER BY expiry_date ASC`
      : "",
  );

  const formatPrice = (amount: number) => {
    return formatCurrency(amount, storeProfile?.currency);
  };

  const formatDate = (dateString: string) => {
    return formatDateToDDMMYYYY(dateString);
  };

  const getStatusBadge = (status: Product["status"]): ReactNode => {
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

  const profitMargin = product
    ? (
        ((product.sellingPrice - product.costPrice) / product.costPrice) *
        100
      ).toFixed(1)
    : "0.0";

  const daysToExpiry = product && product.expiryDate
    ? Math.ceil(
        (new Date(product.expiryDate).getTime() - new Date().getTime()) /
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

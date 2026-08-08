import { useQuery } from "@tanstack/react-query";
import { getStockBatchesForProductDetails } from "@/lib/db/queries/inventory";
import { getProductCreator } from "@/lib/db/queries/products";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/query-keys";
import type { StoreProfile } from "@/lib/context/store-context";

import { Product } from "../types";
export type { Product };

export function useProductDetails(
  product: Product | null,
  storeProfile: StoreProfile | null,
) {
  const { data: batchesData, isLoading: loadingBatches } = useQuery({
    ...queryKeys.products.batches(product?.id),
    queryFn: () => product?.id ? getStockBatchesForProductDetails(product.id) : Promise.resolve([]),
    enabled: !!product?.id
  });
  const batches = batchesData || [];

  const { data: creator } = useQuery({
    ...queryKeys.products.creator(product?.id),
    queryFn: () => product?.id ? getProductCreator(product.id) : Promise.resolve(null),
    enabled: !!product?.id,
  });

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
      out_of_stock: "destructive",
    } as const;

    const labels = {
      active: "Active",
      inactive: "Inactive",
      expired: "Expired",
      low_stock: "Low Stock",
      out_of_stock: "Out of Stock",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  const expiryWarningDays = storeProfile?.expiry_warning_days || 90;

  const profitMargin =
    product && product.costPrice > 0
      ? (
          ((product.sellingPrice - product.costPrice) / product.costPrice) *
          100
        ).toFixed(1)
      : null;

  const daysToExpiry = product && product.expiryDate
    ? Math.ceil(
        (new Date(product.expiryDate).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  return {
    batches,
    loadingBatches,
    creator,
    formatPrice,
    formatDate,
    getStatusBadge,
    expiryWarningDays,
    profitMargin,
    daysToExpiry,
  };
}

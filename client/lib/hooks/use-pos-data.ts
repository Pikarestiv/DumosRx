import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { getProductsWithStock } from "@/lib/db/queries/products";
import { getRecentSales, getRecentlySoldProductIds, getCommonlySoldProductIds } from "@/lib/db/queries/sales";
import { getAllCustomers } from "@/lib/db/queries/customers";
import { getPaymentAccounts } from "@/lib/db/queries/setup";
export type { POSProduct as Product } from "@/lib/types/product";

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
  outstanding_balance: number;
}

export function usePOSData() {
  const { user } = useAuthStore();
  const isRestrictedRole = user?.role === "sales_staff" || user?.role === "specialist";

  const {
    data: products,
    isLoading: loadingProducts,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['posProducts'],
    queryFn: () => getProductsWithStock()
  });

  const { data: recentSales, refetch: refetchSales } = useQuery({
    queryKey: ['recentSales', user?.id],
    queryFn: () => getRecentSales(isRestrictedRole ? user?.id : undefined)
  });

  const { data: recentlySoldIdsData } = useQuery({
    queryKey: ['recentlySoldIds'],
    queryFn: () => getRecentlySoldProductIds()
  });

  const { data: commonlySoldIdsData } = useQuery({
    queryKey: ['commonlySoldIds'],
    queryFn: () => getCommonlySoldProductIds()
  });

  const recentlySoldIds = recentlySoldIdsData || [];
  const commonlySoldIds = commonlySoldIdsData || [];

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['posCustomers'],
    queryFn: () => getAllCustomers()
  });

  const { data: paymentAccounts } = useQuery({
    queryKey: ['paymentAccounts'],
    queryFn: () => getPaymentAccounts()
  });

  return {
    products: products || [],
    loadingProducts,
    refetchProducts,
    recentSales: recentSales || [],
    refetchSales,
    recentlySoldIds,
    commonlySoldIds,
    customers: customers || [],
    loadingCustomers,
    paymentAccounts: paymentAccounts || [],
  };
}

import { useQuery } from "@tanstack/react-query";
import { useAuth, checkCanViewAllActivity } from "@/lib/context/auth-context";
import { getProductsWithStock } from "@/lib/db/queries/products";
import { getRecentSales, getRecentlySoldProductIds, getCommonlySoldProductIds } from "@/lib/db/queries/sales";
import { getAllCustomers } from "@/lib/db/queries/customers";
import { getPaymentAccounts } from "@/lib/db/queries/setup";
import { queryKeys } from "@/lib/query-keys";
export type { POSProduct as Product } from "@/lib/types/product";
export type { Customer } from "@/lib/types/customer";

export function usePOSData() {
  const { user } = useAuth();
  const canViewAllActivity = checkCanViewAllActivity(user?.role);

  const {
    data: products,
    isLoading: loadingProducts,
    refetch: refetchProducts,
  } = useQuery({
    ...queryKeys.pos.products(),
    queryFn: () => getProductsWithStock()
  });

  const { data: recentSales, refetch: refetchSales } = useQuery({
    ...queryKeys.sales.recent(user?.id),
    queryFn: () => getRecentSales(canViewAllActivity ? undefined : user?.id)
  });

  const { data: recentlySoldIdsData } = useQuery({
    ...queryKeys.sales.recentlySoldIds(),
    queryFn: () => getRecentlySoldProductIds()
  });

  const { data: commonlySoldIdsData } = useQuery({
    ...queryKeys.sales.commonlySoldIds(),
    queryFn: () => getCommonlySoldProductIds()
  });

  const recentlySoldIds = recentlySoldIdsData || [];
  const commonlySoldIds = commonlySoldIdsData || [];

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    ...queryKeys.customers.posList(),
    queryFn: () => getAllCustomers()
  });

  const { data: paymentAccounts } = useQuery({
    ...queryKeys.paymentAccounts.all(),
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

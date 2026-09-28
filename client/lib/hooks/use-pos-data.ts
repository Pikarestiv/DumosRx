import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { getProductsWithStock } from "@/lib/db/queries/products";
import { getRecentSales, getRecentlySoldProductIds, getCommonlySoldProductIds } from "@/lib/db/queries/sales";
import { getAllCustomers } from "@/lib/db/queries/customers";
import { getPaymentAccounts } from "@/lib/db/queries/setup";
import { queryKeys } from "@/lib/query-keys";
export type { POSProduct as Product } from "@/lib/types/product";
export type { Customer } from "@/lib/types/customer";
export type { PaymentAccount } from "@/lib/types/payment-account";

export interface POSDataOptions {
  /** Whether the History tab is the active one. getRecentSales() reads 100
   * sales with three correlated subqueries per row and nothing outside that
   * tab consumes it, so leave this false while it isn't showing. Defaults to
   * true, so a caller with no tab context keeps the old behaviour. */
  historyActive?: boolean;
}

export function usePOSData(options?: POSDataOptions) {
  const historyActive = options?.historyActive ?? true;
  const { user } = useAuth();
  const canViewAllActivity = useHasPermission("view_activity_log");

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
    queryFn: () => getRecentSales(canViewAllActivity ? undefined : user?.id),
    enabled: historyActive,
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

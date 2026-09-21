import { useQuery } from "@tanstack/react-query";
import { getActiveSuppliersForPO, getActiveProductsForPO } from "../db/queries/procurement";
import { queryKeys } from "../query-keys";

export function useProcurementData() {
  const suppliersQuery = useQuery({
    ...queryKeys.procurement.suppliersForPO(),
    queryFn: getActiveSuppliersForPO,
  });
  const productsQuery = useQuery({
    ...queryKeys.procurement.productsForPO(),
    queryFn: getActiveProductsForPO,
  });

  const refetch = () => {
    void suppliersQuery.refetch();
    void productsQuery.refetch();
  };

  return {
    suppliers: suppliersQuery.data ?? [],
    products: productsQuery.data ?? [],
    loading: suppliersQuery.isLoading || productsQuery.isLoading,
    error: suppliersQuery.error ?? productsQuery.error,
    refetch,
  };
}

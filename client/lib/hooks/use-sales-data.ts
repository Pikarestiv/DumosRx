import { useQuery } from "@tanstack/react-query";
import { getHeldTransactions } from '../db/queries/sales';
import { queryKeys } from "../query-keys";

export function useHeldTransactions() {
  const {
    data: heldItems = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    ...queryKeys.heldTransactions.all(),
    queryFn: getHeldTransactions,
  });

  return { heldItems, loading, error, refetch };
}

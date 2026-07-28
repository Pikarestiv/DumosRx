import { useQuery } from "@tanstack/react-query";
import { getHeldTransactions } from '../db/queries/sales';

export function useHeldTransactions() {
  const {
    data: heldItems = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["held_transactions"],
    queryFn: getHeldTransactions,
  });

  return { heldItems, loading, error, refetch };
}

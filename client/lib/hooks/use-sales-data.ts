import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHeldTransactions } from '../db/queries/sales';
import { remove } from '../db/local-database';
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

/** `mutation.variables` (the held transaction id currently being deleted)
 * lets a caller show a per-row spinner/disabled state without needing its
 * own local "which id is busy" state — there's only ever one delete in
 * flight per dialog instance. */
export function useDeleteHeldTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remove("held_transactions", id),
    onSuccess: () => {
      queryClient.invalidateQueries(queryKeys.heldTransactions.all());
      queryClient.invalidateQueries(queryKeys.heldTransactions.count());
    },
  });
}

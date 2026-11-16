import { useQuery } from "@tanstack/react-query";
import { getPayablesDueSummary } from "@/lib/db/queries/payables";
import { queryKeys } from "@/lib/query-keys";

export function usePayablesDue() {
  const { data } = useQuery({
    ...queryKeys.payables.dueSummary(),
    queryFn: getPayablesDueSummary,
    refetchInterval: 60 * 60 * 1000,
  });
  return data;
}

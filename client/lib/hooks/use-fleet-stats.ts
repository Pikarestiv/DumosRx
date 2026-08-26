import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";

export function useFleetStats(enabled: boolean = true) {
  return useQuery({
    ...queryKeys.fleet.stats(),
    queryFn: () => apiClient.getFleetStats(),
    enabled,
  });
}

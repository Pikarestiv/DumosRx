import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { apiClient } from "@/lib/api/client";

export function useAccountManager() {
  return useQuery({
    ...queryKeys.accountManager.show(),
    queryFn: () => apiClient.getAccountManager(),
    staleTime: 5 * 60 * 1000,
  });
}

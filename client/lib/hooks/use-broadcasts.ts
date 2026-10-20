import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";

// Shared by BroadcastBanner and NotificationBell:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-broadcasts-ts-L5
export function useBroadcasts(storeId?: string) {
  return useQuery({
    ...queryKeys.broadcasts.all(storeId),
    queryFn: async () => {
      const response = await apiClient.getBroadcasts(storeId);
      return response?.success && Array.isArray(response.data) ? response.data : [];
    },
    refetchInterval: 2 * 60 * 1000,
  });
}

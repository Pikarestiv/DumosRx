import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Shared by BroadcastBanner and NotificationBell — both need the same
 * broadcasts list (banner shows danger/warning as a top banner, the
 * notification dropdown shows everything else), so this is one query instead
 * of each component independently fetching + polling on its own interval.
 */
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

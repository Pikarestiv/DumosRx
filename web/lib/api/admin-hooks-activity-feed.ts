import { useInfiniteQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { ActivityFeedType, AdminActivityFeed } from "@/lib/types/admin";

/**
 * A Map, not an object: these keys arrive from the API response, and §8
 * forbids dynamic bracket lookup on input-derived values.
 */
const ACTIVITY_TYPE_LABELS = new Map<ActivityFeedType, string>([
  ["admin_action", "Admin actions"],
  ["sync_failure", "Sync failures"],
  ["subscription", "Subscriptions"],
  ["payment", "Payments"],
]);

export const activityTypeLabel = (type: ActivityFeedType): string =>
  ACTIVITY_TYPE_LABELS.get(type) ?? type;

export const useAdminActivityFeed = (type: ActivityFeedType | null) =>
  useInfiniteQuery({
    queryKey: useScopedKey(["admin-activity-feed", type ?? "all"]),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (pageParam) params.set("cursor", pageParam);

      return webApiClient.request<AdminActivityFeed>(
        `admin/activity-feed${params.toString() ? `?${params.toString()}` : ""}`,
      );
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 30 * 1000,
  });

import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type {
  AdminSubscriptionFigures,
  AdminSubscriptionWorklist,
  SubscriptionBucket,
} from "@/lib/types/admin";

export const SUBSCRIPTION_WINDOWS = [7, 14, 30] as const;

export const useAdminSubscriptionLifecycle = (days = 7, enabled = true) =>
  useQuery({
    queryKey: useScopedKey(["admin-subscription-lifecycle", days]),
    queryFn: () =>
      webApiClient.request<AdminSubscriptionFigures>(`admin/subscriptions/lifecycle?days=${days}`),
    enabled,
    staleTime: 60 * 1000,
  });

export const useAdminSubscriptionBucket = (
  bucket: SubscriptionBucket,
  days = 7,
  page = 1,
  enabled = true,
) =>
  useQuery({
    queryKey: useScopedKey(["admin-subscription-bucket", bucket, days, page]),
    queryFn: () =>
      webApiClient.request<AdminSubscriptionWorklist>(
        `admin/subscriptions/${bucket}?days=${days}&page=${page}`,
      ),
    enabled,
    staleTime: 60 * 1000,
  });

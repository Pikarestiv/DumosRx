import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { AdminTrends } from "@/lib/types/admin";

export const TREND_WINDOWS = ["30d", "6m", "12m"] as const;

export type TrendWindow = (typeof TREND_WINDOWS)[number];

export const TREND_WINDOW_LABELS: Record<TrendWindow, string> = {
  "30d": "30 days",
  "6m": "6 months",
  "12m": "12 months",
};

export const useAdminTrends = (window: TrendWindow = "6m", enabled = true) =>
  useQuery({
    queryKey: useScopedKey(["admin-trends", window]),
    queryFn: () => webApiClient.request<AdminTrends>(`admin/trends?window=${window}`),
    enabled,
    staleTime: 60 * 1000,
  });

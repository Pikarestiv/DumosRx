import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";

export interface RevenueTransaction {
  id: string;
  date: string;
  plan: string;
  provider: string;
  is_manual: boolean;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  customer: string | null;
  email: string | null;
}

export interface RevenueOverview {
  total_revenue: number;
  manual_revenue: number;
  automated_revenue: number;
  by_plan_tier: Record<string, number>;
  transactions: {
    data: RevenueTransaction[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
    };
  };
}

export interface RevenueFilters {
  page?: number;
  search?: string;
  provider?: string;
  plan?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const useAdminRevenue = (filters: RevenueFilters = {}) => {
  const { page = 1, search = "", provider = "", plan = "", dateFrom = "", dateTo = "" } = filters;

  const params = new URLSearchParams();
  params.set("page", String(page));
  if (search) params.set("search", search);
  if (provider) params.set("provider", provider);
  if (plan) params.set("plan", plan);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);

  return useQuery({
    queryKey: useScopedKey(["admin-revenue", page, search, provider, plan, dateFrom, dateTo]),
    queryFn: () => webApiClient.request<RevenueOverview>(`admin/marketing/revenue?${params.toString()}`),
  });
};

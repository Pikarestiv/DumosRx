import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type {
  AdminSummary,
  AdminHealth,
  AdminErrors,
  AdminProductsResponse,
  PaginatedResponse,
  AdminStoreSummary,
} from "@/lib/types/admin";

export const useAdminSummary = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: useScopedKey(["admin-summary"]),
    queryFn: () => webApiClient.request<AdminSummary>("admin/summary"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
};

export const useAdminStores = (page = 1, search = "", status = "", plan = "") => {
  return useQuery({
    queryKey: useScopedKey(["admin-stores", page, search, status, plan]),
    queryFn: () => webApiClient.request<PaginatedResponse<AdminStoreSummary>>(`admin/stores?page=${page}${search ? `&search=${search}` : ""}${status ? `&status=${status}` : ""}${plan ? `&plan=${plan}` : ""}`),
  });
};

export const useAdminProducts = (page = 1, search = "", category = "") => {
  return useQuery({
    queryKey: useScopedKey(["admin-products", page, search, category]),
    queryFn: () => webApiClient.request<AdminProductsResponse>(`admin/products?page=${page}${search ? `&search=${search}` : ""}${category ? `&category=${category}` : ""}`),
  });
};

export const useAdminHealth = () => {
  return useQuery({
    queryKey: useScopedKey(["admin-health"]),
    queryFn: () => webApiClient.request<AdminHealth>("admin/health"),
    refetchInterval: 30000, // Every 30 seconds
  });
};

export const useAdminErrors = () => {
  return useQuery({
    queryKey: useScopedKey(["admin-errors"]),
    queryFn: () => webApiClient.request<AdminErrors>("admin/errors"),
    refetchInterval: 60000, // Every minute: Sentry issue counts don't need 30s freshness
  });
};

export const useStandardizeProductsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webApiClient.request<{ message: string }>("admin/products/standardize", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useSuspendStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      webApiClient.request<unknown>(`admin/stores/${id}/suspend`, {
        method: "POST",
        body: { reason }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useUnsuspendStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/stores/${id}/unsuspend`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useMarkStoreDemoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/stores/${id}/mark-demo`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useUnmarkStoreDemoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/stores/${id}/unmark-demo`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useGrantTrialMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plan, duration, endDate }: { id: string; plan: string; duration?: string; endDate?: string }) =>
      webApiClient.request<unknown>(`admin/stores/${id}/grant-trial`, {
        method: "POST",
        body: { plan, duration, end_date: endDate }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useImpersonateStoreMutation = () => {
  return useMutation({
    mutationFn: (id: string) => webApiClient.impersonateStore(id),
  });
};

export const useRestoreSessionMutation = () => {
  return useMutation({
    mutationFn: (token: string) => webApiClient.restoreSession(token),
  });
};

// Store Hooks
export const useCreateStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      webApiClient.request<unknown>("admin/stores", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

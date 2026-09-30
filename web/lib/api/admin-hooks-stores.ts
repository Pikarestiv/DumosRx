import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import { useAdminStore } from "@/lib/store/use-admin-store";
import type {
  AdminSummary,
  AdminHealth,
  AdminErrors,
  AdminProductsResponse,
  PaginatedResponse,
  AdminStoreSummary,
  RegisteredStoreSummary,
  AdminStoreBillingHistory,
  AdminStoreDetail,
  RestoreStoreResult,
} from "@/lib/types/admin";

export const useAdminSummary = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: useScopedKey(["admin-summary"]),
    // Timed, because the admin header's "Cloud API: Nms" badge needs a real
    // round-trip measurement. This is the one request every admin page makes
    // (and it refetches as it goes stale), so it doubles as the ping instead
    // of adding a dedicated health poll.
    queryFn: async () => {
      const startedAt = performance.now();
      const data = await webApiClient.request<AdminSummary>("admin/summary");
      useAdminStore.getState().setLatency(Math.round(performance.now() - startedAt));
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
};

export type AdminStoresArchivedScope = "active" | "only" | "all";

export const useAdminStores = (
  page = 1,
  search = "",
  status = "",
  plan = "",
  archived: AdminStoresArchivedScope = "active",
) => {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set("search", search);
  if (status) query.set("status", status);
  if (plan) query.set("plan", plan);
  if (archived !== "active") query.set("archived", archived);

  return useQuery({
    queryKey: useScopedKey(["admin-stores", page, search, status, plan, archived]),
    queryFn: () =>
      webApiClient.request<PaginatedResponse<AdminStoreSummary>>(`admin/stores?${query.toString()}`),
    // The previous page's rows stay on screen while a debounced keystroke's
    // query resolves, so the table never collapses to a skeleton mid-typing.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
};

/** The scoped store list platform_admin/agent get in place of the fleet view
 * (which is super_admin-only server-side): the stores this caller registered. */
export const useMyRegisteredStores = (page = 1, search = "") => {
  const query = new URLSearchParams({ page: String(page) });
  if (search) query.set("search", search);

  return useQuery({
    queryKey: useScopedKey(["admin-my-registered-stores", page, search]),
    queryFn: () =>
      webApiClient.request<PaginatedResponse<RegisteredStoreSummary>>(
        `admin/stores/registered-by-me?${query.toString()}`,
      ),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
};

// Backs the Store Details page (/admin/stores/details?id=...). Far more than
// the fleet-list row carries; the store's staff list is a separate call
// (useStoreStaff) so the owner profile dialog can reuse the same one.
export const useAdminStoreDetail = (storeId: string | null) => {
  return useQuery({
    queryKey: useScopedKey(["admin-store-detail", storeId]),
    queryFn: () => webApiClient.request<AdminStoreDetail>(`admin/stores/${storeId}`),
    enabled: !!storeId,
  });
};

// Admin-scoped equivalent of the store-owner-self-service
// `subscription/billing-history` endpoint, which is unusable here since it's
// scoped to the currently-authenticated user, not an arbitrary store an
// admin is viewing. See AdminController::billingHistory /
// AdminService::getBillingHistoryForStore.
export const useAdminStoreBillingHistory = (storeId: string | null) => {
  return useQuery({
    queryKey: useScopedKey(["admin-store-billing-history", storeId]),
    queryFn: () =>
      webApiClient.request<AdminStoreBillingHistory>(
        `admin/stores/${storeId}/billing-history`,
      ),
    enabled: !!storeId,
  });
};

export interface AccountManagerCandidate {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
}

export const useAccountManagerCandidates = () => {
  return useQuery({
    queryKey: useScopedKey(["account-manager-candidates"]),
    queryFn: () =>
      webApiClient.request<{ data: AccountManagerCandidate[] }>("admin/account-managers"),
    staleTime: 5 * 60 * 1000,
  });
};

export const useUpdateAccountManagerMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, accountManagerId }: { storeId: string; accountManagerId: string | null }) =>
      webApiClient.request<unknown>(`admin/stores/${storeId}/account-manager`, {
        method: "PUT",
        body: { account_manager_id: accountManagerId },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
    },
  });
};

export const useAdminProducts = (page = 1, search = "", category = "") => {
  return useQuery({
    queryKey: useScopedKey(["admin-products", page, search, category]),
    queryFn: () => webApiClient.request<AdminProductsResponse>(`admin/products?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}${category ? `&category=${encodeURIComponent(category)}` : ""}`),
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
      void queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
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
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useUnsuspendStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/stores/${id}/unsuspend`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useMarkStoreDemoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/stores/${id}/mark-demo`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useUnmarkStoreDemoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<unknown>(`admin/stores/${id}/unmark-demo`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
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
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useActivatePlanMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plan, billingCycle, amount, reference }: { id: string; plan: string; billingCycle: string; amount: number; reference?: string }) =>
      webApiClient.request<unknown>(`admin/stores/${id}/activate-plan`, {
        method: "POST",
        body: { plan, billing_cycle: billingCycle, amount, reference }
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-revenue"] });
    },
  });
};

export const STORE_PURGE_CONFIRMATION = "DumosRx";

const invalidateStoreLists = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-store-detail"] });
  void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
};

export const useArchiveStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      webApiClient.request<unknown>(`admin/stores/${id}`, {
        method: "DELETE",
        body: { reason },
      }),
    onSuccess: () => invalidateStoreLists(queryClient),
  });
};

export const useRestoreStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<RestoreStoreResult>(`admin/stores/${id}/restore`, { method: "POST" }),
    onSuccess: () => invalidateStoreLists(queryClient),
  });
};

export const usePurgeStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmation }: { id: string; confirmation: string }) =>
      webApiClient.request<{ removed: Record<string, number> }>(`admin/stores/${id}/purge`, {
        method: "DELETE",
        body: { confirmation },
      }),
    onSuccess: () => invalidateStoreLists(queryClient),
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
      void queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

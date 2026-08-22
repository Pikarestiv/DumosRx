import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { ActivityLog } from "@/lib/types/activity";
import type { UserSession, AppNotification, BillingTransaction, SubscriptionStatus } from "@/lib/types/dashboard";

export const useStores = () => {
  return useQuery({
    queryKey: useScopedKey(["stores"]),
    queryFn: () => webApiClient.getDashboardSummary().then(data => data.stores),
  });
};

export const useDashboardSummary = () => {
  return useQuery({
    queryKey: useScopedKey(["dashboard-summary"]),
    queryFn: () => webApiClient.getDashboardSummary(),
  });
};

export const useStaff = (storeId?: string) => {
  return useQuery({
    queryKey: useScopedKey(["staff", storeId]),
    queryFn: () => webApiClient.getStaff(storeId),
  });
};

export const useNotifications = (options?: { refetchInterval?: number; hideLogs?: boolean }) => {
  return useQuery({
    queryKey: useScopedKey(["notifications", options?.hideLogs]),
    queryFn: () => webApiClient.getNotifications().then((data): AppNotification[] => {
      if (!Array.isArray(data)) return [];
      return options?.hideLogs
        ? data.filter((n: AppNotification) => n.category !== "log")
        : data;
    }),
    refetchInterval: options?.refetchInterval,
  });
};

export const useReadNotificationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request(`alerts/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};

export const useLogs = () => {
  return useQuery({
    queryKey: useScopedKey(["logs"]),
    queryFn: () => webApiClient.request<ActivityLog[] | { data: ActivityLog[] }>("logs"),
  });
};

export const useBroadcasts = () => {
  return useQuery({
    queryKey: useScopedKey(["broadcasts"]),
    queryFn: () => webApiClient.getBroadcasts(),
  });
};

// Mutations
export const useCreateStaffMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => webApiClient.createStaff(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useUpdateStaffMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => webApiClient.updateStaff(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });
};

export const useDeleteStaffMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.deleteStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
  });
};

export const useCreateStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => webApiClient.createStore(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useUpdateStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => webApiClient.updateStore(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useDeleteStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.deleteStore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
};

export const useSubscriptionStatus = () => {
  return useQuery({
    queryKey: useScopedKey(["subscription-status"]),
    queryFn: () => webApiClient.getSubscriptionStatus() as Promise<SubscriptionStatus>,
  });
};

export const useReferralStats = () => {
  return useQuery({
    queryKey: useScopedKey(["referral-stats"]),
    queryFn: () => webApiClient.getReferralStats(),
  });
};

export const useInitiatePaymentMutation = () => {
  return useMutation({
    mutationFn: (payload: { amount: number; plan_name: string; coupon_code?: string; interval?: string; use_credits?: boolean }) => webApiClient.initiatePayment(payload),
  });
};

export const useVerifyPaymentMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => webApiClient.verifyPayment(reference),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-status"] });
      queryClient.invalidateQueries({ queryKey: ["billing-history"] });
    },
  });
};

export const useBillingHistory = () => {
  return useQuery({
    queryKey: useScopedKey(["billing-history"]),
    queryFn: () => webApiClient.getBillingHistory() as Promise<{ transactions: BillingTransaction[] }>,
  });
};

// ==========================================
// SESSIONS & SECURITY
// ==========================================

export const useSessions = () => {
  return useQuery({
    queryKey: useScopedKey(["sessions"]),
    queryFn: () => webApiClient.getSessions() as Promise<UserSession[]>,
  });
};

export const useRevokeSessionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
};

export const useRevokeAllSessionsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webApiClient.revokeAllSessions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
};

// ==========================================
// SYSTEM CONFIGS
// ==========================================

export const useSystemConfig = (key: string) => {
  return useQuery({
    queryKey: ["system-config", key],
    queryFn: () => webApiClient.getSystemConfig(key),
    retry: false, // Disable retries to prevent request spam on 500 errors
    refetchOnMount: false, // Prevent child components from refetching immediately if parent already failed
  });
};

export const useUpdateSystemConfigMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => webApiClient.updateSystemConfig(key, value),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["system-config", variables.key] });
    },
  });
};

export const useResendVerificationMutation = () => {
  return useMutation({
    mutationFn: (email: string) => webApiClient.request("resend-verification", {
      method: "POST",
      body: JSON.stringify({ email })
    })
  });
};

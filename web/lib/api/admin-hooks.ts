import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";

export const useAdminSummary = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ["admin-summary"],
    queryFn: () => webApiClient.request<any>("admin/summary"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
};

export const useAdminStores = (page = 1, search = "", status = "", plan = "") => {
  return useQuery({
    queryKey: ["admin-stores", page, search, status, plan],
    queryFn: () => webApiClient.request<any>(`admin/stores?page=${page}${search ? `&search=${search}` : ""}${status ? `&status=${status}` : ""}${plan ? `&plan=${plan}` : ""}`),
  });
};

export const useAdminProducts = (page = 1, search = "", category = "") => {
  return useQuery({
    queryKey: ["admin-products", page, search, category],
    queryFn: () => webApiClient.request<any>(`admin/products?page=${page}${search ? `&search=${search}` : ""}${category ? `&category=${category}` : ""}`),
  });
};

export const useAdminUsers = (page = 1, search = "") => {
  return useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => webApiClient.request<any>(`admin/users?page=${page}${search ? `&search=${search}` : ""}`),
  });
};

export const useAdminHealth = () => {
  return useQuery({
    queryKey: ["admin-health"],
    queryFn: () => webApiClient.request<any>("admin/health"),
    refetchInterval: 30000, // Every 30 seconds
  });
};

export const useStandardizeProductsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webApiClient.request<any>("admin/products/standardize", { method: "POST" }),
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
      webApiClient.request<any>(`admin/stores/${id}/suspend`, { 
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
      webApiClient.request<any>(`admin/stores/${id}/unsuspend`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useGrantTrialMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plan, duration }: { id: string; plan: string; duration: string }) => 
      webApiClient.request<any>(`admin/stores/${id}/grant-trial`, { 
        method: "POST", 
        body: { plan, duration } 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useDeactivateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<any>(`admin/users/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useDeleteUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<any>(`admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useResetUserPasswordMutation = () => {
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<any>(`admin/users/${id}/reset-password`, { method: "POST" }),
  });
};

export const useNotifyUserMutation = () => {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => webApiClient.post(`/admin/users/${id}/notify`, payload),
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

export const useAdminFeedback = (status: string = "all") => {
  return useQuery({
    queryKey: ["admin-feedback", status],
    queryFn: () => webApiClient.getFeedback(status),
  });
};

export const useUpdateFeedbackStatusMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      webApiClient.updateFeedbackStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
  });
};

// Referrals Manager Hooks
export const useReferralsSummary = () => {
  return useQuery({
    queryKey: ["referrals-summary"],
    queryFn: () => webApiClient.request<any>("admin/referrals/summary"),
  });
};

export const useReferralsSettings = () => {
  return useQuery({
    queryKey: ["referrals-settings"],
    queryFn: () => webApiClient.request<any>("admin/referrals/settings"),
  });
};

export const useReferralsRelationships = () => {
  return useQuery({
    queryKey: ["referrals-relationships"],
    queryFn: () => webApiClient.request<any>("admin/referrals"),
  });
};

export const useReferralsTransactions = () => {
  return useQuery({
    queryKey: ["referrals-transactions"],
    queryFn: () => webApiClient.request<any>("admin/referrals/transactions"),
  });
};

export const useUpdateReferralsSettingsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: any) =>
      webApiClient.request<any>("admin/referrals/settings", {
        method: "PUT",
        body: settings,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals-settings"] });
    },
  });
};

export const useAdjustReferralsCreditsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      user_id: string;
      amount: number;
      type: string;
      description: string;
    }) =>
      webApiClient.request<any>("admin/referrals/adjust-credits", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals-summary"] });
      queryClient.invalidateQueries({ queryKey: ["referrals-relationships"] });
      queryClient.invalidateQueries({ queryKey: ["referrals-transactions"] });
    },
  });
};

// Coupons Manager Hooks
export const useAdminCoupons = () => {
  return useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => webApiClient.request<any>("admin/coupons"),
  });
};

export const useGenerateCouponMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) =>
      webApiClient.request<any>("admin/coupons", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
  });
};

export const useToggleCouponMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<any>(`admin/coupons/${id}/toggle`, {
        method: "PUT",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
  });
};

export const useDeleteCouponMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      webApiClient.request<any>(`admin/coupons/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
  });
};

// Email Templates Hooks
export const useAdminEmailTemplates = () => {
  return useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: () => webApiClient.request<any>("admin/email-templates"),
  });
};

export const useUpdateAdminEmailTemplateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, subject, body }: { key: string; subject: string; body: string }) =>
      webApiClient.request<any>(`admin/email-templates/${key}`, {
        method: "PUT",
        body: { subject, body },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
  });
};

// Store Hooks
export const useCreateStoreMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) =>
      webApiClient.request<any>("admin/stores", {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

// Broadcast Hooks
export const useDeleteBroadcastMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.deleteBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
  });
};

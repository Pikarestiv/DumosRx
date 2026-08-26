import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type { AdminUser, PaginatedResponse, PlatformReferrals } from "@/lib/types/admin";

export const useAdminUsers = (page = 1, search = "") => {
  return useQuery({
    queryKey: useScopedKey(["admin-users", page, search]),
    queryFn: () => webApiClient.request<PaginatedResponse<AdminUser>>(`admin/users?page=${page}${search ? `&search=${search}` : ""}`),
  });
};

export const useMyReferrals = (userId?: string) => {
  return useQuery({
    queryKey: useScopedKey(["admin-my-referrals", userId]),
    queryFn: () => webApiClient.request<PlatformReferrals>(`admin/my-referrals${userId ? `?user_id=${userId}` : ""}`),
  });
};

export const checkReferralCode = (code: string, userId?: string) =>
  webApiClient.request<{ available: boolean; code: string }>(
    `admin/referral-code/check?code=${encodeURIComponent(code)}${userId ? `&user_id=${userId}` : ""}`
  );

export const useUpdateReferralCodeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code: string; userId?: string }) =>
      webApiClient.request<{ platform_referral_code: string }>("admin/referral-code", {
        method: "POST",
        body: { code: payload.code, user_id: payload.userId },
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-my-referrals", variables.userId] });
    },
  });
};

export const useGrantUserTrialMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plan, duration, endDate }: { id: string; plan: string; duration?: string; endDate?: string }) =>
      webApiClient.request<unknown>(`admin/users/${id}/grant-trial`, {
        method: "POST",
        body: { plan, duration, end_date: endDate }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useDeactivateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<unknown>(`admin/users/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useReactivateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<unknown>(`admin/users/${id}/reactivate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useDeleteUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<unknown>(`admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useCreatePlatformAdminMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => webApiClient.request<unknown>("admin/users", { method: "POST", body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useResetUserPasswordMutation = () => {
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<{ temp_password: string }>(`admin/users/${id}/reset-password`, { method: "POST" }),
  });
};

export const useNotifyUserMutation = () => {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => webApiClient.post(`/admin/users/${id}/notify`, payload),
  });
};

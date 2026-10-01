import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import type {
  AdminAccountType,
  AdminUser,
  AdminUserProfileUpdate,
  PaginatedResponse,
  PlatformReferrals,
} from "@/lib/types/admin";

const buildUsersQuery = (
  page: number,
  search: string,
  role: string,
  accountType: AdminAccountType | "",
  storeId: string,
) =>
  [
    `page=${page}`,
    search ? `search=${encodeURIComponent(search)}` : "",
    role ? `role=${encodeURIComponent(role)}` : "",
    accountType ? `account_type=${encodeURIComponent(accountType)}` : "",
    storeId ? `store_id=${encodeURIComponent(storeId)}` : "",
  ]
    .filter(Boolean)
    .join("&");

export const useAdminUsers = (
  page = 1,
  search = "",
  role = "",
  accountType: AdminAccountType | "" = "",
) => {
  return useQuery({
    queryKey: useScopedKey(["admin-users", page, search, role, accountType]),
    queryFn: () =>
      webApiClient.request<PaginatedResponse<AdminUser>>(
        `admin/users?${buildUsersQuery(page, search, role, accountType, "")}`,
      ),
  });
};

/** The staff working at one store. Shared by the Store Details page and the
 * owner's profile dialog, so both read the same rows from the same filter
 * rather than each growing its own endpoint. */
export const useStoreStaff = (storeId: string | null | undefined, page = 1) => {
  return useQuery({
    queryKey: useScopedKey(["admin-store-staff", storeId, page]),
    queryFn: () =>
      webApiClient.request<PaginatedResponse<AdminUser>>(
        `admin/users?${buildUsersQuery(page, "", "", "staff", storeId ?? "")}`,
      ),
    enabled: !!storeId,
  });
};

export const useMyReferrals = (userId?: string) => {
  return useQuery({
    queryKey: useScopedKey(["admin-my-referrals", userId]),
    queryFn: () => webApiClient.request<PlatformReferrals>(`admin/my-referrals${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`),
  });
};

export const checkReferralCode = (code: string, userId?: string) =>
  webApiClient.request<{ available: boolean; code: string }>(
    `admin/referral-code/check?code=${encodeURIComponent(code)}${userId ? `&user_id=${encodeURIComponent(userId)}` : ""}`
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
      void queryClient.invalidateQueries({ queryKey: ["admin-my-referrals", variables.userId] });
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
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useActivateUserPlanMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, plan, billingCycle, amount, reference }: { id: string; plan: string; billingCycle: string; amount: number; reference?: string }) =>
      webApiClient.request<unknown>(`admin/users/${id}/activate-plan`, {
        method: "POST",
        body: { plan, billing_cycle: billingCycle, amount, reference }
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-revenue"] });
    },
  });
};

export const useDeactivateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<unknown>(`admin/users/${id}/deactivate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useReactivateUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<unknown>(`admin/users/${id}/reactivate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useDeleteUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => webApiClient.request<unknown>(`admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useCreatePlatformAdminMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => webApiClient.request<unknown>("admin/users", { method: "POST", body: payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
};

export const useUpdateUserProfileMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdminUserProfileUpdate }) =>
      webApiClient.request<unknown>(`admin/users/${id}`, { method: "PUT", body: payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-store-staff"] });
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

export const useBulkNotifyUsersMutation = () => {
  return useMutation({
    mutationFn: (payload: { title: string; message: string; filters?: Record<string, unknown> }) =>
      webApiClient.post("/admin/users/bulk-notify", payload) as Promise<{ message: string; count: number }>,
  });
};
